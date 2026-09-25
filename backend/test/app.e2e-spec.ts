import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsInt, IsString, Min } from 'class-validator';
import * as request from 'supertest';
import { configureApp } from '../src/config/app-setup';

class CreateThingDto {
  @IsString()
  name: string;

  @IsInt()
  @Min(1)
  count: number;
}

@Controller('things')
class ThingsController {
  @Post()
  create(@Body() dto: CreateThingDto) {
    return dto;
  }

  @Get('boom')
  boom() {
    throw new Error('unexpected');
  }
}

describe('Global validation and error format (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThingsController],
    }).compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(() => app.close());

  it('accepts a valid DTO', () =>
    request(app.getHttpServer())
      .post('/things')
      .send({ name: 'a', count: 2 })
      .expect(201)
      .expect({ name: 'a', count: 2 }));

  it('returns 400 with field errors for an invalid DTO', async () => {
    const res = await request(app.getHttpServer())
      .post('/things')
      .send({ name: 42, count: 0 })
      .expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      path: '/things',
    });
    expect(res.body.message).toEqual(
      expect.arrayContaining([
        'name must be a string',
        'count must not be less than 1',
      ]),
    );
    expect(typeof res.body.timestamp).toBe('string');
    expect(typeof res.body.requestId).toBe('string');
  });

  it('rejects unknown fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/things')
      .send({ name: 'a', count: 1, isAdmin: true })
      .expect(400);
    expect(res.body.message).toContain('property isAdmin should not exist');
  });

  it('echoes x-request-id and hides internal errors', async () => {
    const res = await request(app.getHttpServer())
      .get('/things/boom')
      .set('x-request-id', 'req-123')
      .expect(500);
    expect(res.body).toMatchObject({
      statusCode: 500,
      message: 'Internal server error',
      requestId: 'req-123',
    });
  });
});
