import { DataSource } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import { LeaderboardBoardService } from './leaderboard-board.service';

const TODAY = new Date('2026-11-24T10:00:00Z');

type Entry = { member: string; score: number };

// In-memory stand-in for the sorted-set parts of RedisService.
class FakeRedis {
  kv = new Map<string, string>();
  zsets = new Map<string, Map<string, number>>();

  get = jest.fn(async (k: string) => this.kv.get(k) ?? null);
  set = jest.fn(async (k: string, v: string) => {
    this.kv.set(k, v);
  });
  replaceSortedSet = jest.fn(async (k: string, entries: Entry[]) => {
    if (entries.length === 0) this.zsets.delete(k);
    else this.zsets.set(k, new Map(entries.map((e) => [e.member, e.score])));
  });
  zaddMany = jest.fn(async (k: string, entries: Entry[]) => {
    const z = this.zsets.get(k) ?? new Map<string, number>();
    entries.forEach((e) => z.set(e.member, e.score));
    this.zsets.set(k, z);
  });
  zrem = jest.fn(async (k: string, members: string[]) => {
    members.forEach((m) => this.zsets.get(k)?.delete(m));
  });
  // Highest score first; ties broken by member, descending (as Redis does).
  private sorted(k: string): Entry[] {
    return [...(this.zsets.get(k) ?? [])]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => b.score - a.score || (a.member < b.member ? 1 : -1));
  }
  zcard = jest.fn(async (k: string) => this.zsets.get(k)?.size ?? 0);
  zrevrangeWithScores = jest.fn(async (k: string, s: number, e: number) =>
    this.sorted(k).slice(s, e + 1),
  );
  zrevrank = jest.fn(async (k: string, m: string) => {
    const i = this.sorted(k).findIndex((x) => x.member === m);
    return i < 0 ? null : i;
  });
  zscore = jest.fn(
    async (k: string, m: string) => this.zsets.get(k)?.get(m) ?? null,
  );
}

describe('LeaderboardBoardService', () => {
  let service: LeaderboardBoardService;
  let redis: FakeRedis;
  let query: jest.Mock;
  let results: { address: string; wins: number; points: string }[];
  let streaks: { address: string; streak: number }[];

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(TODAY);
    redis = new FakeRedis();
    results = [
      { address: 'GA', wins: 3, points: '120' },
      { address: 'GB', wins: 5, points: '90' },
      { address: 'GC', wins: 0, points: '0' },
    ];
    streaks = [
      { address: 'GA', streak: 4 },
      { address: 'GB', streak: 2 },
    ];
    query = jest.fn(async (sql: string) =>
      sql.includes('chain_answers') ? streaks : results,
    );
    service = new LeaderboardBoardService(
      { query } as unknown as DataSource,
      redis as unknown as RedisService,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('builds boards from the database on first read and ranks by the metric', async () => {
    const wins = await service.getBoard({ window: 'all', metric: 'wins' });
    expect(wins.data).toEqual([
      { rank: 1, address: 'GB', score: 5 },
      { rank: 2, address: 'GA', score: 3 },
      { rank: 3, address: 'GC', score: 0 },
    ]);

    const points = await service.getBoard({ window: 'all', metric: 'points' });
    expect(points.data.map((e) => e.address)).toEqual(['GA', 'GB', 'GC']);

    const streak = await service.getBoard({ window: 'all', metric: 'streak' });
    expect(streak.data.map((e) => [e.address, e.score])).toEqual([
      ['GA', 4],
      ['GB', 2],
      ['GC', 0],
    ]);
  });

  it('serves later reads from Redis without querying the database again', async () => {
    await service.getBoard({});
    query.mockClear();

    await service.getBoard({ metric: 'points' });

    expect(query).not.toHaveBeenCalled();
  });

  it('paginates and offsets ranks', async () => {
    const page = await service.getBoard({
      window: 'all',
      metric: 'wins',
      page: 2,
      limit: 2,
    });
    expect(page.data).toEqual([{ rank: 3, address: 'GC', score: 0 }]);
    expect(page.total).toBe(3);
    expect(page.totalPages).toBe(2);

    const beyond = await service.getBoard({ page: 9, limit: 2 });
    expect(beyond.data).toEqual([]);
  });

  it('queries each window with its UTC start (null for all-time)', async () => {
    await service.rebuildAll(TODAY);

    const starts = query.mock.calls
      .filter(([sql]) => sql.includes('chain_round_results crr'))
      .map(([, params]) => params[0]);
    expect(starts[0]).toEqual(new Date('2026-11-24T00:00:00Z')); // daily
    expect(starts[1]).toEqual(new Date('2026-11-18T00:00:00Z')); // weekly
    expect(starts[2]).toBeNull(); // all
  });

  it('all-time wins score equals the wins derived from the database', async () => {
    // Acceptance: board rounds_won == on-chain get_player_stat.rounds_won,
    // which the indexer tables reproduce (co-winners on the top score > 0).
    for (const r of results) {
      const rank = await service.getRank(r.address, 'all', 'wins');
      expect(rank?.score).toBe(r.wins);
    }
  });

  it('getRank returns position, score and board size, or null if unranked', async () => {
    expect(await service.getRank('GA', 'all', 'wins')).toEqual({
      address: 'GA',
      window: 'all',
      metric: 'wins',
      rank: 2,
      score: 3,
      total: 3,
    });
    expect(await service.getRank('GNOBODY')).toBeNull();
  });

  it('rebuilds when the boards were built for a previous UTC day', async () => {
    await service.getBoard({});
    redis.kv.set('lbboard:v2:ready', '2026-11-23');
    query.mockClear();

    await service.getBoard({});

    expect(query).toHaveBeenCalled();
    expect(redis.kv.get('lbboard:v2:ready')).toBe('2026-11-24');
  });

  it('a rebuild replaces drifted cache contents with the database truth', async () => {
    await service.rebuildAll(TODAY);
    redis.zsets.get('lbboard:v2:all:wins')!.set('GGHOST', 99);
    redis.zsets.get('lbboard:v2:all:wins')!.set('GA', 1);

    await service.rebuildAll(TODAY);

    const board = redis.zsets.get('lbboard:v2:all:wins')!;
    expect(board.has('GGHOST')).toBe(false);
    expect(board.get('GA')).toBe(3);
  });

  it('shares a single in-flight rebuild between concurrent callers', async () => {
    await Promise.all([service.getBoard({}), service.getBoard({})]);

    // 3 windows x 2 queries, once.
    expect(query).toHaveBeenCalledTimes(6);
  });

  describe('round.completed refresh', () => {
    it('re-derives participants and sets (not increments) their scores', async () => {
      await service.rebuildAll(TODAY);
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT DISTINCT player')) return [{ player: 'GA' }];
        if (sql.includes('chain_answers'))
          return [{ address: 'GA', streak: 6 }];
        return [{ address: 'GA', wins: 4, points: '150' }];
      });

      await service.handleRoundCompleted({ roundId: '7' });
      await service.handleRoundCompleted({ roundId: '7' }); // idempotent

      expect(redis.zsets.get('lbboard:v2:all:wins')!.get('GA')).toBe(4);
      expect(redis.zsets.get('lbboard:v2:all:points')!.get('GA')).toBe(150);
      expect(redis.zsets.get('lbboard:v2:all:streak')!.get('GA')).toBe(6);
      // Untouched players keep their entries.
      expect(redis.zsets.get('lbboard:v2:all:wins')!.get('GB')).toBe(5);
    });

    it('removes a player with no activity left in the window', async () => {
      await service.rebuildAll(TODAY);
      query.mockImplementation(async (sql: string) =>
        sql.includes('SELECT DISTINCT player') ? [{ player: 'GA' }] : [],
      );

      await service.handleRoundCompleted({ roundId: '7' });

      expect(redis.zsets.get('lbboard:v2:daily:wins')!.has('GA')).toBe(false);
    });

    it('does nothing while boards are not built (next read rebuilds)', async () => {
      query.mockResolvedValue([{ player: 'GA' }]);

      await service.handleRoundCompleted({ roundId: '7' });

      expect(redis.zaddMany).not.toHaveBeenCalled();
    });

    it('swallows database errors so the event bus is not disturbed', async () => {
      query.mockRejectedValue(new Error('db down'));

      await expect(
        service.handleRoundCompleted({ roundId: '7' }),
      ).resolves.toBeUndefined();
    });
  });
});
