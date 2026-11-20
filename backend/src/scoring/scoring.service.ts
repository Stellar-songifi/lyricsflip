import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { SCORING_CONSTANTS } from './constants/scoring.constants';
import { ScoreCalculationDto, ScoreResult } from './types/scoring.types';
import {
  ScoreCalculatedEvent,
  StreakUpdatedEvent,
} from './events/scoring.events';
import { Player } from '@app/player/player.entity';
import { Scoring } from './entities/scoring.entity';
import { UpdateScoringDto } from './dto/update-scoring.dto';

@Injectable()
export class ScoringService {
  constructor(
    @InjectRepository(Player)
    private readonly playerRepository: Repository<Player>,

    @InjectRepository(Scoring)
    private readonly scoringRepository: Repository<Scoring>,
    private eventEmitter: EventEmitter2,
  ) {}

  calculateScore(params: ScoreCalculationDto): ScoreResult {
    // Base score calculation
    const baseScore = this.calculateBaseScore(
      params.isCorrect,
      params.difficultyLevel,
    );

    // Time bonus calculation
    const timeBonus = this.calculateTimeBonus(params.responseTimeMs);

    // Streak bonus calculation
    const { streakBonus, newStreak } = this.calculateStreakBonus(
      params.isCorrect,
      params.currentStreak,
    );

    // Calculate total score
    const totalScore = Math.round(
      baseScore + timeBonus + baseScore * streakBonus,
    );

    const result: ScoreResult = {
      baseScore,
      timeBonus,
      streakBonus,
      totalScore,
      newStreak,
    };

    // Emit score calculated event
    this.eventEmitter.emit(
      'score.calculated',
      new ScoreCalculatedEvent(params.playerId, result, new Date()),
    );

    // Emit streak updated event if changed
    if (params.currentStreak !== newStreak) {
      this.eventEmitter.emit(
        'streak.updated',
        new StreakUpdatedEvent(params.playerId, newStreak, new Date()),
      );
    }

    return result;
  }

  private calculateBaseScore(
    isCorrect: boolean,
    difficultyLevel: number,
  ): number {
    if (!isCorrect) return 0;

    const difficultyMultiplier = this.getDifficultyMultiplier(difficultyLevel);
    return SCORING_CONSTANTS.BASE_SCORE * difficultyMultiplier;
  }

  private calculateTimeBonus(responseTimeMs: number): number {
    if (!this.isValidResponseTime(responseTimeMs)) return 0;

    const timeRatio =
      1 -
      (responseTimeMs - SCORING_CONSTANTS.MIN_RESPONSE_TIME_MS) /
        (SCORING_CONSTANTS.MAX_RESPONSE_TIME_MS -
          SCORING_CONSTANTS.MIN_RESPONSE_TIME_MS);

    return Math.round(
      SCORING_CONSTANTS.MAX_TIME_BONUS * Math.max(0, timeRatio),
    );
  }

  private calculateStreakBonus(
    isCorrect: boolean,
    currentStreak: number,
  ): { streakBonus: number; newStreak: number } {
    if (!isCorrect) {
      return { streakBonus: 0, newStreak: 0 };
    }

    const newStreak = currentStreak + 1;
    const streakBonus = Math.min(
      newStreak * SCORING_CONSTANTS.STREAK_BONUS_INCREMENT,
      SCORING_CONSTANTS.MAX_STREAK_BONUS_MULTIPLIER - 1,
    );

    return { streakBonus, newStreak };
  }

  private getDifficultyMultiplier(level: number): number {
    return (
      1 + ((level - 1) / 9) * (SCORING_CONSTANTS.MAX_DIFFICULTY_MULTIPLIER - 1)
    );
  }

  private isValidResponseTime(responseTimeMs: number): boolean {
    return (
      responseTimeMs >= SCORING_CONSTANTS.MIN_RESPONSE_TIME_MS &&
      responseTimeMs <= SCORING_CONSTANTS.MAX_RESPONSE_TIME_MS
    );
  }

  async updatePlayerScore(
    playerId: string,
    scoreResult: ScoreResult,
  ): Promise<void> {
    const player = await this.playerRepository.findOne({
      where: { id: playerId },
    });

    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }

    player.score += scoreResult.totalScore;
    player.currentStreak = scoreResult.newStreak;
    player.highestStreak = Math.max(
      player.highestStreak,
      scoreResult.newStreak,
    );

    await this.playerRepository.save(player);
  }

  async recordScore(userId: string, score: number): Promise<Scoring> {
    const newScore = this.scoringRepository.create({ userId, score });
    return await this.scoringRepository.save(newScore);
  }

  async calculateRankings(): Promise<Scoring[]> {
    const scores = await this.scoringRepository.find({ order: { score: 'DESC' } });
    scores.forEach((score, index) => {
      score.ranking = index + 1;
    });
    return await this.scoringRepository.save(scores);
  }

  async getUserStatistics(userId: string): Promise<Scoring | null> {
    return await this.scoringRepository.findOne({ where: { userId } });
  }

  async getLeaderboard(): Promise<Scoring[]> {
    return await this.scoringRepository.find({ order: { score: 'DESC' }, take: 10 });
  }

  async updateScore(id: number, updateScoringDto: UpdateScoringDto): Promise<Scoring> {
    const scoreEntry = await this.scoringRepository.findOne({ where: { id } });
  
    if (!scoreEntry) {
      throw new NotFoundException(`Score entry with ID ${id} not found`);
    }
  
    Object.assign(scoreEntry, updateScoringDto);
    return await this.scoringRepository.save(scoreEntry);
  }
  
}
