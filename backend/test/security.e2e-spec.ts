import { Controller, Get, INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { configureApp } from '../src/config/app-setup';
import { configureCors } from '../src/config/cors';
import { AppLogger } from '../src/logger/app-logger.service';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { pong: true };
  }
}

describe('HTTP hardening (e2e)', () => {
  let app: INestApplication;
  const allowedOrigin = 'https://app.example.com';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PingController],
      providers: [{ provide: AppLogger, useValue: new AppLogger() }],
    }).compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    configureCors(app, {
      get: (key: string) => {
        if (key === 'cors.origin') return allowedOrigin;
        if (key === 'nodeEnv') return 'test';
        return undefined;
      },
    } as unknown as Pick<ConfigService, 'get'>);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('sends Helmet security headers', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/ping')
      .expect(200);

    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows the configured origin with credentials', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/ping')
      .set('Origin', allowedOrigin)
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('refuses a cross-origin request from an unlisted origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/ping')
      .set('Origin', 'https://evil.example.com')
      .expect(403);

    expect(res.body).toMatchObject({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Origin not allowed',
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refuses a preflight from an unlisted origin', async () => {
    await request(app.getHttpServer())
      .options('/api/v1/ping')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'GET')
      .expect(403);
  });
});
