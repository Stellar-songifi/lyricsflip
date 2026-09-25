import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { CustomThrottlerGuard } from '../src/auth/guard/throttler.guard';
import {
  AuthThrottle,
  AUTH_THROTTLE,
  DEFAULT_THROTTLE,
} from '../src/common/throttler/throttle-limits';

// Mirrors app.module.ts's global throttler wiring (in-memory storage here
// instead of Redis, so this runs without any infra), scoped down to a
// throwaway controller so the test doesn't need the rest of the app.
@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

@Controller('auth')
@AuthThrottle() // Same decorator AuthController applies to every /auth/* route.
class AuthPingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

async function createThrottledApp(
  controllers: any[],
): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot({
        throttlers: [{ name: 'default', ...DEFAULT_THROTTLE }],
      }),
    ],
    controllers,
    providers: [{ provide: APP_GUARD, useClass: CustomThrottlerGuard }],
  }).compile();

  const app = moduleFixture.createNestApplication();
  await app.init();
  return app;
}

describe('Rate limiting (e2e)', () => {
  describe('global default limit', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createThrottledApp([PingController]);
    });

    afterAll(async () => {
      await app.close();
    });

    it(`allows ${DEFAULT_THROTTLE.limit} requests/min then 429s the next one`, async () => {
      for (let i = 0; i < DEFAULT_THROTTLE.limit; i++) {
        await request(app.getHttpServer()).get('/ping').expect(200);
      }

      await request(app.getHttpServer()).get('/ping').expect(429);
    });
  });

  describe('stricter /auth/* limit', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createThrottledApp([AuthPingController]);
    });

    afterAll(async () => {
      await app.close();
    });

    it(`hits its own ${AUTH_THROTTLE.limit}/min limit well before the global ${DEFAULT_THROTTLE.limit}/min one`, async () => {
      expect(AUTH_THROTTLE.limit).toBeLessThan(DEFAULT_THROTTLE.limit);

      for (let i = 0; i < AUTH_THROTTLE.limit; i++) {
        await request(app.getHttpServer()).get('/auth/ping').expect(200);
      }

      await request(app.getHttpServer()).get('/auth/ping').expect(429);
    });
  });
});
