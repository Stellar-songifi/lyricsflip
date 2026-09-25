// src/game/game-modes/time-attack-mode.service.ts
import { Injectable } from '@nestjs/common';
import { BaseGameMode } from './base-game-mode';
import { TimeAttackScoringStrategy } from '../strategies/scoring/time-attack-scoring.strategy';

@Injectable()
export class TimeAttackModeService extends BaseGameMode {
  constructor(scoringStrategy: TimeAttackScoringStrategy) {
    super(scoringStrategy);
  }

  initialize(): void {
    this.id = 'time-attack';
    this.name = 'Time Attack Mode';
    this.description = 'Race against the clock to get the highest score';
    this.rules = [
      'Complete objectives as quickly as possible',
      'Time-based scoring',
      'Fixed time limit per level'
    ];
    this.maxPlayers = 1;
    this.minPlayers = 1;
    this.scoringStrategy = 'time-attack';
    this.timeLimit = 180; // 3 minutes
  }

  protected initializePlayerStats(): any {
    return {
      points: 0,
      objectivesCompleted: 0,
      timeTaken: 0,
      checkpoints: [],
    };
  }
}
