import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardBoardService } from './leaderboard-board.service';
import { LeaderboardRoundResult } from '../entities/leaderboard-round-result.entity';
import { RedisService } from '../../redis/redis.service';

describe('LeaderboardService', () => {
  let service: LeaderboardService;
  let repository: jest.Mocked<Repository<LeaderboardRoundResult>>;
  let redisService: jest.Mocked<RedisService>;

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
          // Ranked boards live in LeaderboardBoardService.
          provide: LeaderboardBoardService,
          useValue: { getRank: jest.fn() },
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

  describe('recordRoundResult and handleRoundCompleted', () => {
    it('invalidates cached player profiles after recording a round result', async () => {
      repository.create.mockReturnValue({} as LeaderboardRoundResult);
      repository.save.mockResolvedValue({} as LeaderboardRoundResult);

      await service.recordRoundResult({
        roundId: '1',
        playerId: 'p1',
        username: 'user-p1',
        genre: 'Pop',
        won: true,
      });

      expect(redisService.delPattern).toHaveBeenCalledWith('player-profile:*');
    });

    it('invalidates cached player profiles on a round.completed event', async () => {
      await service.handleRoundCompleted();

      expect(redisService.delPattern).toHaveBeenCalledWith('player-profile:*');
    });

    it('does not touch the ranked boards when invalidating', async () => {
      await service.handleRoundCompleted();

      expect(redisService.delPattern).not.toHaveBeenCalledWith(
        expect.stringMatching(/^(leaderboard|lbboard)/),
      );
    });
  });
});
