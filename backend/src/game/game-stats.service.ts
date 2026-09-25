// src/game/game-stats.service.ts
import { Injectable } from '@nestjs/common';
import { GameResult } from './interfaces/game-result.interface';

export interface PlayerStats {
  totalGames: number;
  wins: number;
  bestScore: number;
  totalScore: number;
  modeStats: Record<string, {
    gamesPlayed: number;
    wins: number;
    bestScore: number;
    totalScore: number;
    averageRank: number;
  }>;
}

@Injectable()
export class GameStatsService {
  private playerStats: Map<string, PlayerStats> = new Map();
  private modeStats: Map<string, {
    gamesPlayed: number;
    averageDuration: number;
    playerCount: number;
  }> = new Map();

  updateStats(gameResult: GameResult): void {
    this.updateModeStats(gameResult);
    this.updatePlayerStats(gameResult);
  }

  private updateModeStats(gameResult: GameResult): void {
    const { gameMode, startTime, endTime } = gameResult;
    const duration = (endTime.getTime() - startTime.getTime()) / 1000; // in seconds
    
    const currentStats = this.modeStats.get(gameMode) || {
      gamesPlayed: 0,
      averageDuration: 0,
      playerCount: 0,
    };
    
    const newGamesPlayed = currentStats.gamesPlayed + 1;
    const newAverageDuration = 
      ((currentStats.averageDuration * currentStats.gamesPlayed) + duration) / newGamesPlayed;
    const newPlayerCount = currentStats.playerCount + gameResult.players.length;
    
    this.modeStats.set(gameMode, {
      gamesPlayed: newGamesPlayed,
      averageDuration: newAverageDuration,
      playerCount: newPlayerCount,
    });
  }
  
  private updatePlayerStats(gameResult: GameResult): void {
    const { gameMode, winner } = gameResult;
    
    for (const player of gameResult.players) {
      const { id, score, rank } = player;
      
      // Get or initialize player stats
      const playerStat = this.playerStats.get(id) || {
        totalGames: 0,
        wins: 0,
        bestScore: 0,
        totalScore: 0,
        modeStats: {},
      };
      
      // Initialize mode stats if needed
      if (!playerStat.modeStats[gameMode]) {
        playerStat.modeStats[gameMode] = {
          gamesPlayed: 0,
          wins: 0,
          bestScore: 0,
          totalScore: 0,
          averageRank: 0,
        };
      }
      
      // Update overall stats
      playerStat.totalGames += 1;
      playerStat.totalScore += score;
      
      if (id === winner) {
        playerStat.wins += 1;
      }
      
      if (score > playerStat.bestScore) {
        playerStat.bestScore = score;
      }
      
      // Update mode-specific stats
      const modeStats = playerStat.modeStats[gameMode];
      modeStats.gamesPlayed += 1;
      modeStats.totalScore += score;
      
      if (id === winner) {
        modeStats.wins += 1;
      }
      
      if (score > modeStats.bestScore) {
        modeStats.bestScore = score;
      }
      
      // Update average rank
      modeStats.averageRank = 
        ((modeStats.averageRank * (modeStats.gamesPlayed - 1)) + rank) / modeStats.gamesPlayed;
      
      // Save updated stats
      this.playerStats.set(id, playerStat);
    }
  }
  
  getPlayerStats(playerId: string): PlayerStats | null {
    return this.playerStats.get(playerId) || null;
  }
  
  getModeStats(modeId: string): any {
    return this.modeStats.get(modeId) || null;
  }
  
  getLeaderboard(modeId?: string, limit: number = 10): Array<{ playerId: string; wins: number; bestScore: number }> {
    const leaderboard = [];
    
    for (const [playerId, stats] of this.playerStats.entries()) {
      if (modeId) {
        // Mode-specific leaderboard
        const modeStats = stats.modeStats[modeId];
        if (modeStats) {
          leaderboard.push({
            playerId,
            wins: modeStats.wins,
            bestScore: modeStats.bestScore,
          });
        }
      } else {
        // Overall leaderboard
        leaderboard.push({
          playerId,
          wins: stats.wins,
          bestScore: stats.bestScore,
        });
      }
    }
    
    // Sort by wins (primary) and best score (secondary)
    return leaderboard
      .sort((a, b) => b.wins !== a.wins ? b.wins - a.wins : b.bestScore - a.bestScore)
      .slice(0, limit);
  }
}
