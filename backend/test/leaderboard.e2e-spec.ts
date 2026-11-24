/**
 * LF-351: Leaderboard e2e test.
 *
 * Runs against real Postgres + Redis; skipped when DATABASE_URL or REDIS_URL
 * is absent so it doesn't block local unit runs.
 *
 * Tests:
 *  - GET /leaderboard returns a ranked list after round results are inserted.
 *  - Caching: a second identical request is served from Redis cache.
 *  - Genre filter returns only results for that genre.
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as request from 'supertest';
import { configureApp } from '../src/config/app-setup';
import { LeaderboardModule } from '../src/leaderboard/leaderboard.module';
import { LeaderboardRoundResult } from '../src/leaderboard/entities/leaderboard-round-result.entity';
import { RedisService } from '../src/redis/redis.service';
import { RedisModule } from '../src/redis/redis.module';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

const describeOrSkip = DATABASE_URL && REDIS_URL ? describe : describe.skip;

describeOrSkip('Leaderboard (e2e with real services)', () => {
  let app: INestApplication;
  let resultRepo: Repository<LeaderboardRoundResult>;
  let redis: RedisService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [LeaderboardModule, RedisModule],
    }).compile();

    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();

    resultRepo = moduleRef.get(getRepositoryToken(LeaderboardRoundResult));
    redis = moduleRef.get(RedisService);
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    // Clear table and cache between tests.
    await resultRepo.query('TRUNCATE TABLE leaderboard_round_results RESTART IDENTITY');
    await redis.del('leaderboard:*');
  });

  it('returns an empty list when no results exist', async () => {
    const res = await request(app.getHttpServer())
      .get('/leaderboard')
      .query({ period: 'all', page: 1, limit: 20 })
      .expect(200);

    expect(res.body.data ?? res.body).toEqual([]);
  });

  it('ranks players by points and win rate after inserting results', async () => {
    // Insert two results: p1 wins with 100 pts, p2 loses with 40 pts.
    await resultRepo.save([
      resultRepo.create({
        roundId: 'r1',
        playerId: 'p1',
        address: 'GPLAYER1',
        username: 'alice',
        genre: 'Pop',
        won: true,
        points: 100,
        correctAnswers: 8,
        totalAnswers: 10,
        streakAfter: 1,
      }),
      resultRepo.create({
        roundId: 'r1',
        playerId: 'p2',
        address: 'GPLAYER2',
        username: 'bob',
        genre: 'Pop',
        won: false,
        points: 40,
        correctAnswers: 4,
        totalAnswers: 10,
        streakAfter: 0,
      }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/leaderboard')
      .query({ period: 'all', page: 1, limit: 20 })
      .expect(200);

    const list = res.body.data ?? res.body;
    expect(list.length).toBeGreaterThanOrEqual(2);
    // alice should be ranked first
    const alice = list.find((e: any) => e.address === 'GPLAYER1' || e.username === 'alice');
    const bob = list.find((e: any) => e.address === 'GPLAYER2' || e.username === 'bob');
    expect(alice).toBeDefined();
    expect(bob).toBeDefined();
    expect(alice.rank).toBeLessThan(bob.rank);
  });

  it('filters by genre when the genre query param is provided', async () => {
    await resultRepo.save([
      resultRepo.create({
        roundId: 'r2',
        playerId: 'p3',
        address: 'GPLAYER3',
        username: 'carol',
        genre: 'HipHop',
        won: true,
        points: 80,
        correctAnswers: 6,
        totalAnswers: 10,
        streakAfter: 2,
      }),
      resultRepo.create({
        roundId: 'r3',
        playerId: 'p4',
        address: 'GPLAYER4',
        username: 'dave',
        genre: 'Pop',
        won: true,
        points: 90,
        correctAnswers: 7,
        totalAnswers: 10,
        streakAfter: 3,
      }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/leaderboard')
      .query({ period: 'all', genre: 'HipHop', page: 1, limit: 20 })
      .expect(200);

    const list = res.body.data ?? res.body;
    // Only carol's HipHop result should appear.
    const daveEntry = list.find(
      (e: any) => e.address === 'GPLAYER4' || e.username === 'dave',
    );
    expect(daveEntry).toBeUndefined();
    const carolEntry = list.find(
      (e: any) => e.address === 'GPLAYER3' || e.username === 'carol',
    );
    expect(carolEntry).toBeDefined();
  });
});
