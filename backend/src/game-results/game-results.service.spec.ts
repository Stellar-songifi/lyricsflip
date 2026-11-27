import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GameResultsService } from './game-results.service';
import { GameResult } from './entities/game-result.entity';
import { CreateGameResultDto } from './dto/game-result.dto';

describe('GameResultsService', () => {
  let service: GameResultsService;
  let mockRepository;
  let mockEventEmitter;

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameResultsService,
        {
          provide: getRepositoryToken(GameResult),
          useValue: mockRepository,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<GameResultsService>(GameResultsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateFinalScore', () => {
    it('should calculate correct score based on game data and time', () => {
      const gameData = {
        baseScore: 500,
        achievements: ['first_win', 'perfect_score'],
      };
      const timeSpent = 300;

      const result = service.calculateFinalScore(gameData, timeSpent);

      // Expected: 500 (base) + (1000-300)*0.1 (time bonus) + 2*50 (achievements) = 670
      expect(result).toBe(670);
    });
  });

  describe('createResult', () => {
    it('should create and store a game result', async () => {
      const dto: CreateGameResultDto = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        gameId: '123e4567-e89b-12d3-a456-426614174001',
        gameData: { baseScore: 500 },
        timeSpent: 300,
        achievements: ['first_win'],
      };

      const createdEntity = { ...dto, id: 'new-id', createdAt: new Date() };
      mockRepository.create.mockReturnValue(createdEntity);
      mockRepository.save.mockResolvedValue(createdEntity);

      const result = await service.createResult(dto);

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalled();
      expect(result).toEqual(createdEntity);
    });
  });

  describe('generateLeaderboard', () => {
    it('should return a formatted leaderboard', async () => {
      const gameResults = [
        { userId: 'user1', gameId: 'game1', score: 1000, achievements: ['a1'] },
        { userId: 'user2', gameId: 'game1', score: 900, achievements: ['a2'] },
      ];

      mockRepository.find.mockResolvedValue(gameResults);

      const leaderboard = await service.generateLeaderboard('game1');

      expect(mockRepository.find).toHaveBeenCalled();
      expect(leaderboard.length).toBe(2);
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[1].rank).toBe(2);
    });
  });
});
