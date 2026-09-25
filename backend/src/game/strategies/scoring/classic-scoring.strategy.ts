import { Injectable } from '@nestjs/common';
import { ScoringStrategy } from './scoring-strategy.interface';

@Injectable()
export class ClassicScoringStrategy implements ScoringStrategy {
  calculateScore(gameData: any, playerId: string): number {
    // Implementation based on classic mode rules
    // Points for completed objectives, bonuses, etc.
    return gameData.playerStats[playerId].points;
  }
}