import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthCheckError, TypeOrmHealthIndicator } from '@nestjs/terminus';
import * as request from 'supertest';
import { configureApp } from '../src/config/app-setup';
import { HealthModule } from '../src/health/health.module';
import { RedisHealthIndicator } from '../src/health/redis.health';
import { StellarRpcHealthIndicator } from '../src/health/stellar-rpc.health';

describe('GET /health (e2e)', () => {
  let app: INestApplication;
  let dbUp = true;

  const up = (key: string) => ({ [key]: { status: 'up' } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(TypeOrmHealthIndicator)
      .useValue({
        pingCheck: async (key: string) => {
          if (dbUp) return up(key);
          throw new HealthCheckError('db down', {
            [key]: { status: 'down' },
          });
        },
      })
      .overrideProvider(RedisHealthIndicator)
      .useValue({ isHealthy: async (key: string) => up(key) })
      .overrideProvider(StellarRpcHealthIndicator)
      .useValue({ isHealthy: async (key: string) => up(key) })
      .compile();

    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(() => app.close());

  it('returns 200 with per-dependency status', async () => {
    dbUp = true;
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(Object.keys(res.body.details)).toEqual(
      expect.arrayContaining(['database', 'redis', 'stellarRpc']),
    );
  });

  it('returns 503 when Postgres is down', async () => {
    dbUp = false;
    await request(app.getHttpServer()).get('/health').expect(503);
  });
});
