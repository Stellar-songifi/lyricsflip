process.env.JWT_SECRET = 'test-secret';
process.env.JWT_TOKEN_AUDIENCE = 'lyricsflip-test';
process.env.JWT_TOKEN_ISSUER = 'lyricsflip-test';
process.env.JWT_ACCESS_TOKEN_TTL = '3600';
process.env.JWT_REFRESH_TOKEN_TTL = '7776000';

import { Test, TestingModule } from '@nestjs/testing';
import {
  Controller,
  Get,
  INestApplication,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import { AuthModule } from '../src/auth/auth.module';
import { User } from '../src/user/user.entity';
import { PasswordResetToken } from '../src/auth/entities/password-reset-token.entity';
import { RedisModule } from '../src/redis/redis.module';
import { RedisService } from '../src/redis/redis.service';
import { AccessTokenGuard } from '../src/auth/guard/access-token/access-token.guard';
import jwtConfig from '../src/auth/authConfig/jwt.config';

/**
 * Enough of a TypeORM repository for the wallet-auth flow (findOneBy /
 * create / save), backed by an in-memory array instead of Postgres - so this
 * suite runs without any real database.
 */
class InMemoryUserRepository {
  private rows: Partial<User>[] = [];
  private nextId = 1;

  async findOneBy(where: Partial<User>): Promise<User | null> {
    const [key, value] = Object.entries(where)[0];
    return (this.rows.find((row) => (row as any)[key] === value) as User) ?? null;
  }

  create(data: Partial<User>): User {
    return { ...data } as User;
  }

  async save(user: User): Promise<User> {
    if (!user.id) {
      user.id = String(this.nextId++);
    }
    this.rows.push(user);
    return user;
  }
}

/** In-memory stand-in for RedisService, honoring the same get/set/del + TTL contract. */
class InMemoryRedisService {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttl ? Date.now() + ttl * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/** `Keypair.sign` returns a `Uint8Array`; wrap it to get `.toString('base64')`. */
const signBase64 = (keypair: Keypair, message: string): string =>
  Buffer.from(keypair.sign(Buffer.from(message, 'utf8'))).toString('base64');

// A minimal protected route to exercise the "calls a protected endpoint"
// part of the acceptance criteria, guarded the same way real routes are.
@Controller('protected')
class ProtectedPingController {
  @UseGuards(AccessTokenGuard)
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

describe('Wallet auth (e2e)', () => {
  let app: INestApplication;
  let redis: InMemoryRedisService;

  beforeEach(async () => {
    redis = new InMemoryRedisService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      // RedisModule is imported so its RedisService token exists to
      // override below - the real implementation (which would open a
      // connection) is swapped out before it's ever instantiated.
      // JwtModule/ConfigModule/Reflector are re-declared here because
      // ProtectedPingController - and its `@UseGuards(AccessTokenGuard)` -
      // live in this root test module, not inside AuthModule, so its own
      // dependencies must resolve from here too.
      imports: [
        AuthModule,
        RedisModule,
        ConfigModule.forFeature(jwtConfig),
        JwtModule.registerAsync(jwtConfig.asProvider()),
      ],
      controllers: [ProtectedPingController],
      providers: [AccessTokenGuard, Reflector],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue(new InMemoryUserRepository())
      .overrideProvider(getRepositoryToken(PasswordResetToken))
      .useValue({})
      .overrideProvider(RedisService)
      .useValue(redis)
      .compile();

    app = moduleFixture.createNestApplication();
    // Matches main.ts's real bootstrap, so DTO validation (address format,
    // etc.) actually runs the way it would in production.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lets a generated keypair sign the challenge, get a JWT, and call a protected endpoint', async () => {
    const keypair = Keypair.random();

    const challengeRes = await request(app.getHttpServer())
      .post('/auth/challenge')
      .send({ address: keypair.publicKey() })
      .expect(201);

    const { challenge } = challengeRes.body;
    expect(typeof challenge).toBe('string');

    const verifyRes = await request(app.getHttpServer())
      .post('/auth/verify')
      .send({
        address: keypair.publicKey(),
        signedChallenge: signBase64(keypair, challenge),
      })
      .expect(201);

    const { accessToken } = verifyRes.body;
    expect(typeof accessToken).toBe('string');

    // No token -> rejected.
    await request(app.getHttpServer()).get('/protected/ping').expect(401);

    // Valid token -> the protected endpoint accepts it and can see who's calling.
    const pingRes = await request(app.getHttpServer())
      .get('/protected/ping')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(pingRes.body).toEqual({ ok: true });
  });

  it('rejects a replayed challenge (same signature used twice)', async () => {
    const keypair = Keypair.random();

    const { body: challengeRes } = await request(app.getHttpServer())
      .post('/auth/challenge')
      .send({ address: keypair.publicKey() })
      .expect(201);

    const signature = signBase64(keypair, challengeRes.challenge);

    await request(app.getHttpServer())
      .post('/auth/verify')
      .send({ address: keypair.publicKey(), signedChallenge: signature })
      .expect(201);

    // Same (address, signature) again - the nonce was already consumed.
    await request(app.getHttpServer())
      .post('/auth/verify')
      .send({ address: keypair.publicKey(), signedChallenge: signature })
      .expect(401);
  });

  it('rejects an expired challenge', async () => {
    const keypair = Keypair.random();

    const { body: challengeRes } = await request(app.getHttpServer())
      .post('/auth/challenge')
      .send({ address: keypair.publicKey() })
      .expect(201);

    // Simulate the challenge's TTL having elapsed.
    await redis.del(`wallet-auth:challenge:${keypair.publicKey()}`);

    const signature = signBase64(keypair, challengeRes.challenge);

    await request(app.getHttpServer())
      .post('/auth/verify')
      .send({ address: keypair.publicKey(), signedChallenge: signature })
      .expect(401);
  });

  it('rejects a signature from a different keypair than the address claims', async () => {
    const owner = Keypair.random();
    const impostor = Keypair.random();

    const { body: challengeRes } = await request(app.getHttpServer())
      .post('/auth/challenge')
      .send({ address: owner.publicKey() })
      .expect(201);

    const wrongSignature = signBase64(impostor, challengeRes.challenge);

    await request(app.getHttpServer())
      .post('/auth/verify')
      .send({ address: owner.publicKey(), signedChallenge: wrongSignature })
      .expect(401);
  });

  it('rejects a malformed Stellar address', async () => {
    await request(app.getHttpServer())
      .post('/auth/challenge')
      .send({ address: 'not-a-stellar-address' })
      .expect(400); // class-validator rejects it before it reaches the provider.
  });
});
