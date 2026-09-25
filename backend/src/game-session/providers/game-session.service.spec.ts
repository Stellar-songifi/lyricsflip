import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { GameSessionService } from './game-session.service';
import { GameSession } from '../game-session.entity';
import { GameStatus } from '../enums/game-status.enum';

describe('GameSessionService', () => {
  let service: GameSessionService;

  const repository = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ id: 'session-1', ...data })),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameSessionService,
        { provide: getRepositoryToken(GameSession), useValue: repository },
      ],
    }).compile();

    service = module.get(GameSessionService);
  });

  it('starts an in-progress session and keeps the player ids', async () => {
    const session = await service.start({ gameMode: 'classic', playerIds: ['p1', 'p2'] });

    expect(session).toMatchObject({
      id: 'session-1',
      gameMode: 'classic',
      status: GameStatus.IN_PROGRESS,
      metadata: { playerIds: ['p1', 'p2'] },
    });
  });

  it('completes a session with its result', async () => {
    repository.findOne.mockResolvedValue({ id: 'session-1', metadata: { playerIds: ['p1'] } });

    const session = await service.complete('session-1', { winner: 'p1' }, 120);

    expect(session.status).toBe(GameStatus.COMPLETED);
    expect(session.endTime).toBeInstanceOf(Date);
    expect(session.score).toBe(120);
    expect(session.metadata).toEqual({ playerIds: ['p1'], result: { winner: 'p1' } });
  });

  it('throws for unknown sessions', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('records sessions reported by game insights', async () => {
    const startTime = new Date('2026-01-01T00:00:00Z');
    const endTime = new Date('2026-01-01T00:05:00Z');

    const session = await service.record({ playerId: 'p1', gameTitle: 'LyricsFlip', startTime, endTime });

    expect(session).toMatchObject({
      status: GameStatus.COMPLETED,
      startTime,
      endTime,
      metadata: { playerIds: ['p1'], gameTitle: 'LyricsFlip' },
    });
  });
});
