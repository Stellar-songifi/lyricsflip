// src/progression/services/progression.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlayerStats } from '../entities/player-stats.entity';
import { PlayerLevel } from '../entities/player-level.entity';
import { XpEventDto } from '../dtos/xp-event.dto';

@Injectable()
export class ProgressionService {
  constructor(
    @InjectRepository(PlayerStats)
    private playerStatsRepository: Repository<PlayerStats>,
    @InjectRepository(PlayerLevel)
    private playerLevelRepository: Repository<PlayerLevel>,
    private eventEmitter: EventEmitter2,
  ) {}

  async addXp(xpEvent: XpEventDto): Promise<PlayerStats> {
    const playerStats = await this.getOrCreatePlayerStats(xpEvent.userId);
    const oldLevel = playerStats.level;
    
    playerStats.totalXp += xpEvent.amount;
    
    // Calculate new level
    const newLevel = this.calculateLevel(playerStats.totalXp);
    if (newLevel > oldLevel) {
      await this.handleLevelUp(playerStats, oldLevel, newLevel);
    }
    
    playerStats.level = newLevel;
    
    // Update skill rating and rank
    await this.updateSkillRating(playerStats);
    await this.updateRank(playerStats);
    
    const updatedStats = await this.playerStatsRepository.save(playerStats);
    
    this.eventEmitter.emit('progression.xp.added', {
      userId: xpEvent.userId,
      amount: xpEvent.amount,
      source: xpEvent.source,
      newTotal: updatedStats.totalXp,
      oldLevel,
      newLevel: updatedStats.level,
    });
    
    return updatedStats;
  }

  private async handleLevelUp(
    playerStats: PlayerStats,
    oldLevel: number,
    newLevel: number,
  ): Promise<void> {
    // Record level up history
    const levelUpEvent = this.playerLevelRepository.create({
      playerStats,
      level: newLevel,
      xpGained: this.calculateLevelXp(newLevel) - this.calculateLevelXp(oldLevel),
      totalXp: playerStats.totalXp,
    });
    await this.playerLevelRepository.save(levelUpEvent);

    // Emit level up event
    this.eventEmitter.emit('progression.level.up', {
      userId: playerStats.userId,
      oldLevel,
      newLevel,
      rewards: await this.calculateLevelUpRewards(newLevel),
    });
  }

  private calculateLevel(totalXp: number): number {
    // Simplified level calculation
    return Math.floor(Math.sqrt(totalXp / 100)) + 1;
  }

  private calculateLevelXp(level: number): number {
    // XP required for level
    return Math.pow(level - 1, 2) * 100;
  }

  private async calculateLevelUpRewards(level: number): Promise<any> {
    // Implement reward calculation based on level
    return {
      coins: level * 100,
      items: [`reward_${level}`],
    };
  }

  private async updateSkillRating(playerStats: PlayerStats): Promise<void> {
    // Implement ELO or similar rating system
    const baseRating = playerStats.level * 100;
    const performanceBonus = Math.floor(Math.random() * 50); // Example
    playerStats.skillRating = baseRating + performanceBonus;
  }

  private async updateRank(playerStats: PlayerStats): Promise<void> {
    // Define rank thresholds
    const ranks = [
      { name: 'Bronze', threshold: 0 },
      { name: 'Silver', threshold: 1000 },
      { name: 'Gold', threshold: 2000 },
      { name: 'Platinum', threshold: 3000 },
      { name: 'Diamond', threshold: 4000 },
    ];

    // Find appropriate rank
    const newRank = ranks
      .reverse()
      .find(rank => playerStats.skillRating >= rank.threshold);

    if (newRank && newRank.name !== playerStats.rank) {
      const oldRank = playerStats.rank;
      playerStats.rank = newRank.name;

      this.eventEmitter.emit('progression.rank.changed', {
        userId: playerStats.userId,
        oldRank,
        newRank: newRank.name,
      });
    }
  }

  async getOrCreatePlayerStats(userId: string): Promise<PlayerStats> {
    let playerStats = await this.playerStatsRepository.findOne({
      where: { userId },
      relations: ['levelHistory', 'skills'],
    });

    if (!playerStats) {
      playerStats = this.playerStatsRepository.create({
        userId,
        rank: 'Bronze',
        achievements: [],
        milestones: [],
      });
      await this.playerStatsRepository.save(playerStats);
    }

    return playerStats;
  }
}