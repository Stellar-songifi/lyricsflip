import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardRoundResult } from '../entities/leaderboard-round-result.entity';
import { RedisService } from '../../redis/redis.service';

const makeQueryBuilder = (rawRows: any[]) => {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawRows),
  };
  return qb;
};

describe('LeaderboardService', () => {
  let service: LeaderboardService;
  let repository: jest.Mocked<Repository<LeaderboardRoundResult>>;
  let redisService: jest.Mocked<RedisService>;

  const row = (
    playerId: string,
    roundsPlayed: number,
    roundsWon: number,
    maxStreak: number,
  ) => ({
    playerId,
    address: playerId,
    username: `user-${playerId}`,
    roundsPlayed: String(roundsPlayed),
    roundsWon: String(roundsWon),
    maxStreak: String(maxStreak),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderboardService,
        {
          provide: getRepositoryToken(LeaderboardRoundResult),
          useValue: {
            createQueryBuilder: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: { get: jest.fn(), set: jest.fn(), delPattern: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<LeaderboardService>(LeaderboardService);
    repository = module.get(getRepositoryToken(LeaderboardRoundResult));
    redisService = module.get(RedisService);
    redisService.get.mockResolvedValue(null);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLeaderboard', () => {
    it('ranks players by rounds won, computing win rate from rounds played', async () => {
      const rows = [row('p1', 10, 8, 5), row('p2', 4, 2, 3)];
      (repository.createQueryBuilder as jest.Mock).mockReturnValue(
        makeQueryBuilder(rows),
      );

      const result = await service.getLeaderboard({
        period: 'all',
        page: 1,
        limit: 20,
      });

      expect(result.data).toEqual([
        {
          rank: 1,
          address: 'p1',
          username: 'user-p1',
          roundsWon: 8,
          winRate: 0.8,
          maxStreak: 5,
        },
        {
          rank: 2,
          address: 'p2',
          username: 'user-p2',
          roundsWon: 2,
          winRate: 0.5,
          maxStreak: 3,
        },
      ]);
      expect(result.total).toBe(2);
    });

    it('breaks ties deterministically via the SQL ORDER BY (stable input order preserved)', async () => {
      // Two players tied on roundsWon; the query already orders them by
      // roundsPlayed then username, so the service should not reorder rows.
      const rows = [row('a', 5, 3, 1), row('b', 6, 3, 1)];
      (repository.createQueryBuilder as jest.Mock).mockReturnValue(
        makeQueryBuilder(rows),
      );

      const result = await service.getLeaderboard({
        period: 'all',
        page: 1,
        limit: 20,
      });

      expect(result.data.map((e) => e.address)).toEqual(['a', 'b']);
      expect(result.data[0].rank).toBe(1);
      expect(result.data[1].rank).toBe(2);
    });

    it('paginates the aggregated rows and offsets rank accordingly', async () => {
      const rows = [row('a', 1, 1, 1), row('b', 1, 1, 1), row('c', 1, 1, 1)];
      (repository.createQueryBuilder as jest.Mock).mockReturnValue(
        makeQueryBuilder(rows),
      );

      const result = await service.getLeaderboard({
        period: 'all',
        page: 2,
        limit: 2,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ address: 'c', rank: 3 });
      expect(result.total).toBe(3);
      expect(result.totalPages).toBe(2);
    });

    it('filters by genre when provided', async () => {
      const qb = makeQueryBuilder([]);
      (repository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.getLeaderboard({
        period: 'all',
        genre: 'Pop',
        page: 1,
        limit: 20,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('r.genre = :genre', {
        genre: 'Pop',
      });
    });

    it('serves cached results without touching the repository', async () => {
      const cached = { data: [], page: 1, limit: 20, total: 0, totalPages: 0 };
      redisService.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getLeaderboard({
        period: 'all',
        page: 1,
        limit: 20,
      });

      expect(result).toEqual(cached);
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('recordRoundResult and handleRoundCompleted', () => {
    it('invalidates the leaderboard cache after recording a round result', async () => {
      repository.create.mockReturnValue({} as LeaderboardRoundResult);
      repository.save.mockResolvedValue({} as LeaderboardRoundResult);

      await service.recordRoundResult({
        roundId: '1',
        playerId: 'p1',
        username: 'user-p1',
        genre: 'Pop',
        won: true,
      });

      expect(redisService.delPattern).toHaveBeenCalledWith('leaderboard:*');
    });

    it('invalidates the leaderboard cache on a round.completed event', async () => {
      await service.handleRoundCompleted();

      expect(redisService.delPattern).toHaveBeenCalledWith('leaderboard:*');
    });
  });
});
