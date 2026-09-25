import { Injectable } from '@nestjs/common';
import { BaseGameMode } from './base-game-mode';
import { BattleRoyaleScoringStrategy } from '../strategies/scoring/battle-royale-scoring.strategy';

@Injectable()
export class BattleRoyaleModeService extends BaseGameMode {
  constructor(scoringStrategy: BattleRoyaleScoringStrategy) {
    super(scoringStrategy);
  }

  initialize(): void {
    this.id = 'battle-royale';
    this.name = 'Battle Royale Mode';
    this.description = 'Last player standing wins';
    this.rules = [
      'Eliminate other players to win',
      'Last player standing is the winner',
      'Shrinking play area over time'
    ];
    this.maxPlayers = 100;
    this.minPlayers = 25;
    this.scoringStrategy = 'battle-royale';
    this.timeLimit = 1200; // 20 minutes max
  }

  protected initializePlayerStats(): any {
    return {
      points: 0,
      eliminations: 0,
      survivalTime: 0,
      rank: 0,
      status: 'active', // can be 'active', 'eliminated'
    };
  }
}