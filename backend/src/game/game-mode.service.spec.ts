import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GameModeService } from './game-mode.service';
import { GameStatsService } from './game-stats.service';
import { ClassicModeService } from './game-modes/classic-mode.service';
import { TimeAttackModeService } from './game-modes/time-attack-mode.service';
import { EndlessModeService } from './game-modes/endless-mode.service';
import { BattleRoyaleModeService } from './game-modes/battle-royale-mode.service';
import { ClassicScoringStrategy } from './strategies/scoring/classic-scoring.strategy';
import { TimeAttackScoringStrategy } from './strategies/scoring/time-attack-scoring.strategy';
import { EndlessScoringStrategy } from './strategies/scoring/endless-scoring.strategy';
import { BattleRoyaleScoringStrategy } from './strategies/scoring/battle-royale-scoring.strategy';
import { GameSessionService } from '../game-session/providers/game-session.service';

describe('GameModeService', () => {
  let service: GameModeService;
  let stats: GameStatsService;

  const gameSessionService = {
    start: jest.fn(async (dto) => ({ id: 'session-1', ...dto })),
    findOne: jest.fn(async () => ({ id: 'session-1', gameMode: 'classic' })),
    complete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameModeService,
        GameStatsService,
        ClassicModeService,
        TimeAttackModeService,
        EndlessModeService,
        BattleRoyaleModeService,
        ClassicScoringStrategy,
        TimeAttackScoringStrategy,
        EndlessScoringStrategy,
        BattleRoyaleScoringStrategy,
        { provide: GameSessionService, useValue: gameSessionService },
      ],
    }).compile();
    await module.init();

    service = module.get(GameModeService);
    stats = module.get(GameStatsService);
  });

  it('registers the four built-in modes', () => {
    expect(service.getAllModes().map((m) => m.id).sort()).toEqual(
      ['battle-royale', 'classic', 'endless', 'time-attack'],
    );
    expect(() => service.getModeById('nope')).toThrow(NotFoundException);
  });

  it('persists a session when a game starts', async () => {
    const session = await service.startSession('classic', ['p1', 'p2']);

    expect(gameSessionService.start).toHaveBeenCalledWith({
      gameMode: 'classic',
      playerIds: ['p1', 'p2'],
      maxPlayers: 4,
    });
    expect(session.id).toBe('session-1');
  });

  it('rejects a player count the mode does not allow', async () => {
    await expect(service.startSession('endless', ['p1', 'p2'])).rejects.toThrow();
    expect(gameSessionService.start).not.toHaveBeenCalled();
  });

  it('ends a session, records stats and completes the stored session', async () => {
    await service.startSession('classic', ['p1', 'p2']);

    const result = await service.endSession('session-1');

    expect(result.gameSessionId).toBe('session-1');
    expect(result.players.map((p) => p.rank)).toEqual([1, 1]);
    expect(stats.getModeStats('classic')).toMatchObject({ gamesPlayed: 1, playerCount: 2 });
    expect(gameSessionService.complete).toHaveBeenCalledWith('session-1', result, 0);
  });
});
