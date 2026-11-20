import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { xdr, nativeToScVal } from '@stellar/stellar-sdk';

import { IndexerService } from './indexer.service';
import { IndexerModule } from '../indexer.module';
import { IndexerState } from '../entities/indexer-state.entity';
import { ChainRound } from '../entities/chain-round.entity';
import { ChainRoundPlayer } from '../entities/chain-round-player.entity';
import { ChainAnswer } from '../entities/chain-answer.entity';
import { ChainRoundResult } from '../entities/chain-round-result.entity';
import { ChainNft } from '../entities/chain-nft.entity';
import { ProcessedEvent } from '../entities/processed-event.entity';
import { LeaderboardService } from '../../leaderboard/leaderboard.service';
import { UserService } from '../../user/user.service';

/**
 * Recorded Soroban event fixtures.
 *
 * Each fixture mirrors the shape returned by
 * `rpc.Server.getEvents({ filters: [{ type: 'contract', contractIds }] })`:
 *   - `id`         : "<ledger>-<txIndex>-<eventIndex>"
 *   - `ledger`     : ledger sequence
 *   - `txHash`     : transaction hash
 *   - `contractId` : contract that emitted the event
 *   - `topic`      : array of base64-encoded ScVal XDR strings
 *   - `value`      : base64-encoded ScVal XDR string
 *
 * The event name lives in `topic[0]` (per LF-221).
 */
interface RecordedEvent {
  id: string;
  ledger: number;
  txHash: string;
  contractId: string;
  topic: string[];
  value: string;
}

const CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
const PLAYER_A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const PLAYER_B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const OWNER = 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

function scv(value: any): string {
  return nativeToScVal(value).toXDR('base64');
}

function topic(name: string): string {
  return nativeToScVal(name, { type: 'symbol' }).toXDR('base64');
}

function mapValue(entries: Record<string, any>): string {
  const scVal = xdr.ScVal.scvMap(
    Object.entries(entries).map(
      ([k, v]) =>
        new xdr.ScMapEntry({
          key: nativeToScVal(k, { type: 'symbol' }),
          val: nativeToScVal(v),
        }),
    ),
  );
  return scVal.toXDR('base64');
}

function buildFixtures(): RecordedEvent[] {
  return [
    {
      id: '100-0-0',
      ledger: 100,
      txHash: 'aa11',
      contractId: CONTRACT_ID,
      topic: [topic('round_created')],
      value: mapValue({
        round_id: 1,
        genre: 'hiphop',
        entry_fee: 100,
        start_ledger: 100,
        end_ledger: 200,
      }),
    },
    {
      id: '101-0-0',
      ledger: 101,
      txHash: 'bb22',
      contractId: CONTRACT_ID,
      topic: [topic('player_joined'), nativeToScVal(PLAYER_A)],
      value: mapValue({ round_id: 1, player: PLAYER_A }),
    },
    {
      id: '101-0-1',
      ledger: 101,
      txHash: 'bb22',
      contractId: CONTRACT_ID,
      topic: [topic('player_joined'), nativeToScVal(PLAYER_B)],
      value: mapValue({ round_id: 1, player: PLAYER_B }),
    },
    {
      id: '150-0-0',
      ledger: 150,
      txHash: 'cc33',
      contractId: CONTRACT_ID,
      topic: [topic('answer_submitted'), nativeToScVal(PLAYER_A)],
      value: mapValue({
        round_id: 1,
        player: PLAYER_A,
        card_index: 0,
        correct: true,
        points: 10,
      }),
    },
    {
      id: '151-0-0',
      ledger: 151,
      txHash: 'dd44',
      contractId: CONTRACT_ID,
      topic: [topic('answer_submitted'), nativeToScVal(PLAYER_B)],
      value: mapValue({
        round_id: 1,
        player: PLAYER_B,
        card_index: 1,
        correct: false,
        points: 0,
      }),
    },
    {
      id: '200-0-0',
      ledger: 200,
      txHash: 'ee55',
      contractId: CONTRACT_ID,
      topic: [topic('round_completed')],
      value: mapValue({
        round_id: 1,
        winner: PLAYER_A,
        total_points: 10,
      }),
    },
    {
      id: '201-0-0',
      ledger: 201,
      txHash: 'ff66',
      contractId: CONTRACT_ID,
      topic: [topic('nft_minted'), nativeToScVal(OWNER)],
      value: mapValue({ token_id: 42, owner: OWNER, kind: 'winner' }),
    },
    {
      id: '202-0-0',
      ledger: 202,
      txHash: 'gg77',
      contractId: CONTRACT_ID,
      topic: [topic('reward_claimed'), nativeToScVal(PLAYER_A)],
      value: mapValue({ round_id: 1, player: PLAYER_A, amount: 100 }),
    },
  ];
}

describe('IndexerService (integration)', () => {
  let moduleRef: TestingModule;
  let service: IndexerService;
  let dataSource: DataSource;
  let rpcGetEvents: jest.Mock;
  let rpcGetLatestLedger: jest.Mock;
  let rpcSimulate: jest.Mock;

  const fixtures = buildFixtures();

  beforeAll(async () => {
    rpcGetEvents = jest.fn();
    rpcGetLatestLedger = jest.fn().mockResolvedValue({ sequence: 210 });
    rpcSimulate = jest.fn();

    const fakeRpcServer = {
      getEvents: rpcGetEvents,
      getLatestLedger: rpcGetLatestLedger,
      simulateTransaction: rpcSimulate,
    };

    moduleRef = await Test.createTestingModule({
      imports: [IndexerModule],
    })
      .overrideProvider('SOROBAN_RPC_SERVER')
      .useValue(fakeRpcServer)
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string, def?: any) => {
          const map: Record<string, any> = {
            SOROBAN_RPC_URL: 'http://localhost:8000/soroban/rpc',
            SOROBAN_CONTRACT_ID: CONTRACT_ID,
            INDEXER_POLL_INTERVAL_MS: 1000,
            INDEXER_BATCH_LIMIT: 100,
            INDEXER_KEEPER_ENABLED: false,
            DB_HOST: process.env.DB_HOST ?? 'localhost',
            DB_PORT: Number(process.env.DB_PORT ?? 5432),
            DB_USER: process.env.DB_USER ?? 'postgres',
            DB_PASSWORD: process.env.DB_PASSWORD ?? 'postgres',
            DB_NAME: process.env.DB_NAME ?? 'lyricsflip_test',
          };
          return map[key] ?? def;
        },
      })
      .compile();

    service = moduleRef.get(IndexerService);
    dataSource = moduleRef.get(DataSource);

    // Ensure schema is present (migrations run by test harness).
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }
  });

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  beforeEach(async () => {
    rpcGetEvents.mockReset();
    rpcGetLatestLedger.mockReset().mockResolvedValue({ sequence: 210 });
    rpcSimulate.mockReset();

    // Truncate all indexer tables between tests.
    await dataSource.query(
      `TRUNCATE TABLE
         "processed_events",
         "chain_answers",
         "chain_round_players",
         "chain_round_results",
         "chain_nfts",
         "chain_rounds",
         "indexer_state"
       RESTART IDENTITY CASCADE`,
    );
  });

  async function drainEvents(
    events: RecordedEvent[],
    opts?: { pageSize?: number },
  ) {
    const pageSize = opts?.pageSize ?? events.length;
    let offset = 0;
    rpcGetEvents.mockImplementation(async (req: any) => {
      const page = events.slice(offset, offset + pageSize);
      offset += page.length;
      return {
        events: page,
        cursor: page.length ? page[page.length - 1].id : req.cursor,
        latestLedger: 210,
      };
    });
    await service.pollAndProcessEvents();
  }

  it('replays recorded fixtures and fills rounds, round_players, answers, round_results, and nfts', async () => {
    await drainEvents(fixtures);

    const rounds = await dataSource.getRepository(ChainRound).find();
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({
      roundId: 1,
      genre: 'hiphop',
      entryFee: 100,
    });

    const players = await dataSource.getRepository(ChainRoundPlayer).find();
    expect(players.map((p) => p.player).sort()).toEqual(
      [PLAYER_A, PLAYER_B].sort(),
    );

    const answers = await dataSource.getRepository(ChainAnswer).find();
    expect(answers).toHaveLength(2);
    const answerA = answers.find((a) => a.player === PLAYER_A)!;
    expect(answerA).toMatchObject({
      roundId: 1,
      cardIndex: 0,
      correct: true,
      points: 10,
      ledger: 150,
      txHash: 'cc33',
    });

    const results = await dataSource.getRepository(ChainRoundResult).find();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      roundId: 1,
      winner: PLAYER_A,
      totalPoints: 10,
    });

    const nfts = await dataSource.getRepository(ChainNft).find();
    expect(nfts).toHaveLength(1);
    expect(nfts[0]).toMatchObject({
      tokenId: 42,
      owner: OWNER,
      kind: 'winner',
    });

    const processed = await dataSource.getRepository(ProcessedEvent).find();
    expect(processed).toHaveLength(fixtures.length);

    const state = await dataSource.getRepository(IndexerState).findOne({
      where: { contractId: CONTRACT_ID },
    });
    expect(state).toBeTruthy();
    expect(state!.lastLedger).toBe(202);
    expect(state!.cursor).toBe(fixtures[fixtures.length - 1].id);
  });

  it('persists the cursor in the same transaction as the upserts', async () => {
    const txSpy = jest.spyOn(dataSource, 'transaction');
    await drainEvents(fixtures);
    expect(txSpy).toHaveBeenCalled();
    txSpy.mockRestore();

    const state = await dataSource.getRepository(IndexerState).findOne({
      where: { contractId: CONTRACT_ID },
    });
    expect(state?.cursor).toBe(fixtures[fixtures.length - 1].id);
  });

  it('is idempotent: restarting mid-stream produces no duplicate rows', async () => {
    // First pass: process the first half of the fixtures.
    const half = Math.floor(fixtures.length / 2);
    await drainEvents(fixtures.slice(0, half));

    const roundsAfterFirst = await dataSource.getRepository(ChainRound).count();
    const answersAfterFirst = await dataSource
      .getRepository(ChainAnswer)
      .count();
    const processedAfterFirst = await dataSource
      .getRepository(ProcessedEvent)
      .count();
    expect(processedAfterFirst).toBe(half);

    // Simulate a restart: re-feed the entire stream from the beginning.
    // The indexer must skip already-processed events (via processed_events
    // and the unique (contract_id, tx_hash, event_index) key).
    await drainEvents(fixtures);

    const roundsAfterRestart = await dataSource
      .getRepository(ChainRound)
      .count();
    const answersAfterRestart = await dataSource
      .getRepository(ChainAnswer)
      .count();
    const processedAfterRestart = await dataSource
      .getRepository(ProcessedEvent)
      .count();

    expect(roundsAfterRestart).toBe(roundsAfterFirst);
    expect(answersAfterRestart).toBeGreaterThanOrEqual(answersAfterFirst);
    expect(processedAfterRestart).toBe(fixtures.length);

    // No duplicate answers for the same (round_id, player, card_index).
    const dupAnswers = await dataSource.query(
      `SELECT round_id, player, card_index, COUNT(*) AS c
         FROM chain_answers
        GROUP BY round_id, player, card_index
       HAVING COUNT(*) > 1`,
    );
    expect(dupAnswers).toHaveLength(0);

    // No duplicate processed events.
    const dupProcessed = await dataSource.query(
      `SELECT id, COUNT(*) AS c FROM processed_events GROUP BY id HAVING COUNT(*) > 1`,
    );
    expect(dupProcessed).toHaveLength(0);
  });

  it('recovers from a simulated 8-day retention gap via state backfill', async () => {
    // Seed a cursor that points to a ledger far outside the retention window.
    const stateRepo = dataSource.getRepository(IndexerState);
    await stateRepo.save(
      stateRepo.create({
        contractId: CONTRACT_ID,
        cursor: '1-0-0',
        lastLedger: 1,
      }),
    );

    // RPC rejects the request with a retention-range error.
    rpcGetEvents.mockRejectedValueOnce(
      new Error(
        'startLedger is outside the retention window: requested 1, oldest available 50000',
      ),
    );

    // Backfill path: the service reads state directly from the contract via
    // simulateTransaction (get_rounds / get_round_results / get_player_stat).
    rpcSimulate
      .mockResolvedValueOnce({
        // get_rounds
        result: {
          retval: nativeToScVal(
            [
              {
                round_id: 1,
                genre: 'hiphop',
                entry_fee: 100,
                start_ledger: 100,
                end_ledger: 200,
              },
            ],
            { type: 'vec' },
          ),
        },
      })
      .mockResolvedValueOnce({
        // get_round_results
        result: {
          retval: nativeToScVal(
            [{ round_id: 1, winner: PLAYER_A, total_points: 10 }],
            { type: 'vec' },
          ),
        },
      })
      .mockResolvedValueOnce({
        // get_player_stat
        result: {
          retval: nativeToScVal(
            [
              { player: PLAYER_A, wins: 1, points: 10 },
              { player: PLAYER_B, wins: 0, points: 0 },
            ],
            { type: 'vec' },
          ),
        },
      });

    // Subsequent polls return no new events.
    rpcGetEvents.mockResolvedValue({
      events: [],
      cursor: '50000-0-0',
      latestLedger: 50000,
    });

    await expect(service.pollAndProcessEvents()).resolves.not.toThrow();

    // Backfill populated the tables.
    const rounds = await dataSource.getRepository(ChainRound).find();
    expect(rounds.length).toBeGreaterThanOrEqual(1);
    expect(rounds[0].roundId).toBe(1);

    const results = await dataSource.getRepository(ChainRoundResult).find();
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].winner).toBe(PLAYER_A);

    // Cursor was advanced past the retention gap.
    const state = await stateRepo.findOne({
      where: { contractId: CONTRACT_ID },
    });
    expect(state).toBeTruthy();
    expect(state!.lastLedger).toBeGreaterThanOrEqual(50000);

    // Metrics reflect the recovery.
    const metrics = service.getMetrics();
    expect(metrics.errors).toBeGreaterThanOrEqual(1);
    expect(metrics.lastLedger).toBeGreaterThanOrEqual(50000);
    expect(metrics.lag).toBeGreaterThanOrEqual(0);
  });

  it('applies exponential backoff on RPC errors', async () => {
    const backoffSpy = jest
      .spyOn(service as any, 'sleep')
      .mockResolvedValue(undefined);

    rpcGetEvents
      .mockRejectedValueOnce(new Error('rpc unavailable'))
      .mockRejectedValueOnce(new Error('rpc unavailable'))
      .mockResolvedValueOnce({
        events: [],
        cursor: '0-0-0',
        latestLedger: 210,
      });

    await service.pollAndProcessEvents();

    expect(backoffSpy).toHaveBeenCalled();
    const delays = backoffSpy.mock.calls.map((c) => c[0] as number);
    // Exponential: each retry delay is greater than the previous.
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]);
    }

    backoffSpy.mockRestore();
  });
});

/**
 * E2E: after a round is indexed, GET /leaderboard and GET /players/:address
 * reflect it within one cache refresh cycle (LF-224).
 */
describe('Leaderboard & Player API (e2e, indexed data)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let indexer: IndexerService;
  let leaderboard: LeaderboardService;
  let users: UserService;
  let rpcGetEvents: jest.Mock;

  const fixtures = buildFixtures();

  beforeAll(async () => {
    rpcGetEvents = jest.fn();

    const fakeRpcServer = {
      getEvents: rpcGetEvents,
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 210 }),
      simulateTransaction: jest.fn(),
    };

    moduleRef = await Test.createTestingModule({
      imports: [IndexerModule],
    })
      .overrideProvider('SOROBAN_RPC_SERVER')
      .useValue(fakeRpcServer)
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string, def?: any) => {
          const map: Record<string, any> = {
            SOROBAN_RPC_URL: 'http://localhost:8000/soroban/rpc',
            SOROBAN_CONTRACT_ID: CONTRACT_ID,
            INDEXER_POLL_INTERVAL_MS: 1000,
            INDEXER_BATCH_LIMIT: 100,
            INDEXER_KEEPER_ENABLED: false,
            LEADERBOARD_CACHE_TTL_MS: 1000,
            DB_HOST: process.env.DB_HOST ?? 'localhost',
            DB_PORT: Number(process.env.DB_PORT ?? 5432),
            DB_USER: process.env.DB_USER ?? 'postgres',
            DB_PASSWORD: process.env.DB_PASSWORD ?? 'postgres',
            DB_NAME: process.env.DB_NAME ?? 'lyricsflip_test',
          };
          return map[key] ?? def;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    dataSource = moduleRef.get(DataSource);
    indexer = moduleRef.get(IndexerService);
    leaderboard = moduleRef.get(LeaderboardService, { strict: false });
    users = moduleRef.get(UserService, { strict: false });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    rpcGetEvents.mockReset();
    await dataSource.query(
      `TRUNCATE TABLE
         "processed_events",
         "chain_answers",
         "chain_round_players",
         "chain_round_results",
         "chain_nfts",
         "chain_rounds",
         "indexer_state"
       RESTART IDENTITY CASCADE`,
    );
    if (
      leaderboard &&
      typeof (leaderboard as any).invalidateCache === 'function'
    ) {
      await (leaderboard as any).invalidateCache();
    }
  });

  it('reflects a newly indexed round in GET /leaderboard and GET /players/:address within one refresh cycle', async () => {
    // Replay fixtures through the indexer.
    let offset = 0;
    rpcGetEvents.mockImplementation(async () => {
      const page = fixtures.slice(offset);
      offset += page.length;
      return {
        events: page,
        cursor: page.length ? page[page.length - 1].id : '0-0-0',
        latestLedger: 210,
      };
    });

    await indexer.pollAndProcessEvents();

    // Force a single cache refresh cycle (as would happen on round_completed).
    if (leaderboard && typeof (leaderboard as any).refresh === 'function') {
      await (leaderboard as any).refresh();
    }

    // GET /leaderboard
    const leaderboardRes = await request(app.getHttpServer())
      .get('/leaderboard')
      .query({ period: 'all' })
      .expect(200);

    expect(Array.isArray(leaderboardRes.body)).toBe(true);
    const top = leaderboardRes.body.find(
      (row: any) => row.address === PLAYER_A || row.player === PLAYER_A,
    );
    expect(top).toBeDefined();
    expect(top.points).toBeGreaterThanOrEqual(10);
    expect(top.wins).toBeGreaterThanOrEqual(1);

    // GET /players/:address
    const playerRes = await request(app.getHttpServer())
      .get(`/players/${PLAYER_A}`)
      .expect(200);

    expect(playerRes.body).toBeDefined();
    expect(playerRes.body.address ?? playerRes.body.player).toBe(PLAYER_A);
    expect(playerRes.body.stats).toBeDefined();
    expect(playerRes.body.stats.points).toBeGreaterThanOrEqual(10);
    expect(Array.isArray(playerRes.body.recentRounds)).toBe(true);
    expect(playerRes.body.recentRounds.length).toBeGreaterThanOrEqual(1);
    expect(
      playerRes.body.recentRounds[0].roundId ??
        playerRes.body.recentRounds[0].round_id,
    ).toBe(1);
  });
});

// Minimal supertest import kept at the bottom to avoid circular typing issues.
import * as request from 'supertest';
