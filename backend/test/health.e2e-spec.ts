import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthCheckError, TypeOrmHealthIndicator } from '@nestjs/terminus';
import * as request from 'supertest';
import { configureApp } from '../src/config/app-setup';
import { HealthModule } from '../src/health/health.module';
import { IndexerHealthIndicator } from '../src/health/indexer.health';
import { IndexerLagHealthIndicator } from '../src/health/indexer-lag.health';
import { RedisHealthIndicator } from '../src/health/redis.health';
import { StellarRpcHealthIndicator } from '../src/health/stellar-rpc.health';

describe('Health endpoints (e2e)', () => {
  let app: INestApplication;

  // Per-test flags: flip to simulate a dependency going down.
  let dbUp = true;
  let redisUp = true;
  let rpcUp = true;
  let indexerUp = true;
  let indexerLagUp = true;

  const up = (key: string) => ({ [key]: { status: 'up' } });
  const down = (key: string, msg = 'dependency down') => {
    throw new HealthCheckError(msg, { [key]: { status: 'down' } });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(TypeOrmHealthIndicator)
      .useValue({
        pingCheck: async (key: string) => {
          if (dbUp) return up(key);
          down(key, 'db down');
        },
      })
      .overrideProvider(RedisHealthIndicator)
      .useValue({
        isHealthy: async (key: string) => {
          if (redisUp) return up(key);
          down(key, 'redis down');
        },
      })
      .overrideProvider(StellarRpcHealthIndicator)
      .useValue({
        isHealthy: async (key: string) => {
          if (rpcUp) return up(key);
          down(key, 'rpc down');
        },
      })
      .overrideProvider(IndexerHealthIndicator)
      .useValue({
        isHealthy: async (key: string) => {
          if (indexerUp) return up(key);
          down(key, 'indexer down');
        },
      })
      .overrideProvider(IndexerLagHealthIndicator)
      .useValue({
        isHealthy: async (key: string) => {
          if (indexerLagUp) return up(key);
          down(key, 'indexer lag exceeded');
        },
      })
      .compile();

    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(() => app.close());

  // Reset all deps to healthy before each test.
  beforeEach(() => {
    dbUp = true;
    redisUp = true;
    rpcUp = true;
    indexerUp = true;
    indexerLagUp = true;
  });

  describe('GET /health/live', () => {
    it('returns 200 while the process is running (no dependency checks)', async () => {
      // Bring every dep down — live should still return 200.
      dbUp = false;
      redisUp = false;
      rpcUp = false;
      indexerUp = false;
      indexerLagUp = false;

      const res = await request(app.getHttpServer())
        .get('/health/live')
        .expect(200);

      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /health/ready', () => {
    it('returns 200 with per-dependency status when all deps are healthy', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(Object.keys(res.body.details)).toEqual(
        expect.arrayContaining([
          'database',
          'redis',
          'stellarRpc',
          'indexer',
          'indexerLag',
        ]),
      );
    });

    it('returns 503 when Postgres is down', async () => {
      dbUp = false;
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(503);
      expect(res.body.status).toBe('error');
      expect(res.body.error?.database?.status).toBe('down');
    });

    it('returns 503 when Redis is down', async () => {
      redisUp = false;
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(503);
      expect(res.body.status).toBe('error');
      expect(res.body.error?.redis?.status).toBe('down');
    });

    it('returns 503 when Soroban RPC is down', async () => {
      rpcUp = false;
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(503);
      expect(res.body.status).toBe('error');
      expect(res.body.error?.stellarRpc?.status).toBe('down');
    });

    it('returns 503 when the indexer has stalled', async () => {
      indexerUp = false;
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(503);
      expect(res.body.status).toBe('error');
      expect(res.body.error?.indexer?.status).toBe('down');
    });

    it('returns 503 when indexer lag exceeds the threshold', async () => {
      indexerLagUp = false;
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(503);
      expect(res.body.status).toBe('error');
      expect(res.body.error?.indexerLag?.status).toBe('down');
    });
  });

  describe('GET /health (backwards-compat alias)', () => {
    it('returns 200 when all deps are healthy', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
    });

    it('returns 503 when any dependency is down', async () => {
      dbUp = false;
      await request(app.getHttpServer()).get('/health').expect(503);
    });
  });
});
