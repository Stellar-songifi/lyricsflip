import { Test, TestingModule } from '@nestjs/testing';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './providers/leaderboard.service';

describe('LeaderboardController', () => {
  let controller: LeaderboardController;
  let service: jest.Mocked<LeaderboardService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeaderboardController],
      providers: [
        {
          provide: LeaderboardService,
          useValue: { getLeaderboard: jest.fn(), getPlayerRank: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<LeaderboardController>(LeaderboardController);
    service = module.get(LeaderboardService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getLeaderboard forwards the query params to the service', async () => {
    const query = {
      period: 'weekly' as const,
      genre: 'Pop',
      page: 2,
      limit: 10,
    };
    (service.getLeaderboard as jest.Mock).mockResolvedValue({ data: [] });

    await controller.getLeaderboard(query);

    expect(service.getLeaderboard).toHaveBeenCalledWith(query);
  });

  it('getPlayerRank forwards the player id to the service', async () => {
    (service.getPlayerRank as jest.Mock).mockResolvedValue({
      playerId: 'p1',
      rank: 1,
    });

    await controller.getPlayerRank('p1');

    expect(service.getPlayerRank).toHaveBeenCalledWith('p1');
  });
});
