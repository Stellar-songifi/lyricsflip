import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ScoringService } from './scoring.service';
import { SCORING_CONSTANTS } from './constants/scoring.constants';
import { Player } from '@app/player/player.entity';

describe('ScoringService', () => {
  let service: ScoringService;
  let eventEmitter: EventEmitter2;

  const mockPlayerRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoringService,
        {
          provide: getRepositoryToken(Player),
          useValue: mockPlayerRepository,
        },
        EventEmitter2,
      ],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  describe('calculateScore', () => {
    it('should calculate perfect score', () => {
      const params = {
        playerId: '1',
        questionId: '1',
        isCorrect: true,
        responseTimeMs: SCORING_CONSTANTS.MIN_RESPONSE_TIME_MS,
        currentStreak: 0,
        difficultyLevel: 10,
      };

      const result = service.calculateScore(params);

      expect(result.baseScore).toBe(2000); // Max difficulty
      expect(result.timeBonus).toBe(500); // Perfect timing
      expect(result.streakBonus).toBe(0.1); // First streak
      expect(result.newStreak).toBe(1);
    });

    it('should return zero score for incorrect answer', () => {
      const params = {
        playerId: '1',
        questionId: '1',
        isCorrect: false,
        responseTimeMs: 1000,
        currentStreak: 5,
        difficultyLevel: 5,
      };

      const result = service.calculateScore(params);

      expect(result.baseScore).toBe(0);
      expect(result.timeBonus).toBe(0);
      expect(result.streakBonus).toBe(0);
      expect(result.newStreak).toBe(0);
    });

    it('should calculate streak bonus correctly', () => {
      const params = {
        playerId: '1',
        questionId: '1',
        isCorrect: true,
        responseTimeMs: 1000,
        currentStreak: 4,
        difficultyLevel: 5,
      };

      const result = service.calculateScore(params);

      expect(result.newStreak).toBe(5);
      expect(result.streakBonus).toBe(0.5); // 50% bonus for 5 streak
    });
  });

  // Add more test cases...
});
