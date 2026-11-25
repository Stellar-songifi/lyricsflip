import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardBoardService } from './providers/leaderboard-board.service';

describe('LeaderboardController', () => {
  let controller: LeaderboardController;
  let boards: jest.Mocked<LeaderboardBoardService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeaderboardController],
      providers: [
        {
          provide: LeaderboardBoardService,
          useValue: { getBoard: jest.fn(), getRank: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(LeaderboardController);
    boards = module.get(LeaderboardBoardService);
  });

  it('getLeaderboard forwards the query params to the board service', async () => {
    const query = {
      window: 'weekly' as const,
      metric: 'points' as const,
      page: 2,
      limit: 10,
    };
    (boards.getBoard as jest.Mock).mockResolvedValue({ data: [] });

    await controller.getLeaderboard(query);

    expect(boards.getBoard).toHaveBeenCalledWith(query);
  });

  it('getPlayerRank returns the rank for the address, window and metric', async () => {
    const rank = {
      address: 'GA',
      window: 'daily',
      metric: 'streak',
      rank: 3,
      score: 7,
      total: 10,
    };
    (boards.getRank as jest.Mock).mockResolvedValue(rank);

    await expect(
      controller.getPlayerRank('GA', { window: 'daily', metric: 'streak' }),
    ).resolves.toEqual(rank);
    expect(boards.getRank).toHaveBeenCalledWith('GA', 'daily', 'streak');
  });

  it('getPlayerRank responds 404 for an address that is not on the board', async () => {
    (boards.getRank as jest.Mock).mockResolvedValue(null);

    await expect(controller.getPlayerRank('GNOBODY', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
