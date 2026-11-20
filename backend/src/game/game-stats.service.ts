// src/game/game-stats.service.ts
import { Injectable } from '@nestjs/common';
import { GameResult } from './interfaces/game-result.interface';

export interface PlayerStats {
  totalGames: number;
  wins: number;
  bestScore: number;
  totalScore: number;
  totalPoints: number;
  correctAnswers: number;
  totalAnswers: number;
  bestRoundScore: number;
  modeStats: Record<string, {
    gamesPlayed: number;
    wins: number;
    bestScore: number;
    totalScore: number;
    averageRank: number;
  }>;
}

export interface LeaderboardEntry {
  playerId: string;
  wins: number;
  bestScore: number;
  totalPoints: number;
  correctAnswers: number;
  totalAnswers: number;
  accuracy: number;
  bestRoundScore: number;
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
      const correctAnswers = player.correctAnswers ?? 0;
      const totalAnswers = player.totalAnswers ?? 0;

      // Get or initialize player stats
      const playerStat = this.playerStats.get(id) || {
        totalGames: 0,
        wins: 0,
        bestScore: 0,
        totalScore: 0,
        totalPoints: 0,
        correctAnswers: 0,
        totalAnswers: 0,
        bestRoundScore: 0,
        modeStats: {},
      };

      // Migrate legacy entries (LF-157) that may lack the new fields.
      this.migratePlayerStats(playerStat);

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
      playerStat.totalPoints += score;
      playerStat.correctAnswers += correctAnswers;
      playerStat.totalAnswers += totalAnswers;

      if (id === winner) {
        playerStat.wins += 1;
      }

      if (score > playerStat.bestScore) {
        playerStat.bestScore = score;
      }

      if (score > playerStat.bestRoundScore) {
        playerStat.bestRoundScore = score;
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

  // Backfills fields added in LF-165 on entries persisted before the change.
  private migratePlayerStats(stats: PlayerStats): void {
    if (typeof stats.totalPoints !== 'number') {
      stats.totalPoints = stats.totalScore ?? 0;
    }
    if (typeof stats.correctAnswers !== 'number') {
      stats.correctAnswers = 0;
    }
    if (typeof stats.totalAnswers !== 'number') {
      stats.totalAnswers = 0;
    }
    if (typeof stats.bestRoundScore !== 'number') {
      stats.bestRoundScore = stats.bestScore ?? 0;
    }
  }

  getPlayerStats(playerId: string): PlayerStats | null {
    const stats = this.playerStats.get(playerId);
    if (!stats) return null;
    this.migratePlayerStats(stats);
    return stats;
  }

  getModeStats(modeId: string): any {
    return this.modeStats.get(modeId) || null;
  }

  getLeaderboard(modeId?: string, limit: number = 10): LeaderboardEntry[] {
    const leaderboard: LeaderboardEntry[] = [];

    for (const [playerId, stats] of this.playerStats.entries()) {
      this.migratePlayerStats(stats);
      if (modeId) {
        // Mode-specific leaderboard
        const modeStats = stats.modeStats[modeId];
        if (modeStats) {
          leaderboard.push({
            playerId,
            wins: modeStats.wins,
            bestScore: modeStats.bestScore,
            totalPoints: modeStats.totalScore,
            correctAnswers: stats.correctAnswers,
            totalAnswers: stats.totalAnswers,
            accuracy: this.accuracy(stats.correctAnswers, stats.totalAnswers),
            bestRoundScore: stats.bestRoundScore,
          });
        }
      } else {
        // Overall leaderboard
        leaderboard.push({
          playerId,
          wins: stats.wins,
          bestScore: stats.bestScore,
          totalPoints: stats.totalPoints,
          correctAnswers: stats.correctAnswers,
          totalAnswers: stats.totalAnswers,
          accuracy: this.accuracy(stats.correctAnswers, stats.totalAnswers),
          bestRoundScore: stats.bestRoundScore,
        });
      }
    }

    // Sort by wins (primary) and best score (secondary)
    return leaderboard
      .sort((a, b) => b.wins !== a.wins ? b.wins - a.wins : b.bestScore - a.bestScore)
      .slice(0, limit);
  }

  private accuracy(correctAnswers: number, totalAnswers: number): number {
    return totalAnswers > 0 ? correctAnswers / totalAnswers : 0;
  }
}
