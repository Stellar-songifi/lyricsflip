import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GameResult } from './entities/game-result.entity';
import { CreateGameResultDto } from './dto/game-result.dto';
import { LeaderboardEntryDto } from './dto/leaderboard-entry.dto';
import { GameResultCreatedEvent } from './events/game-result.event';

@Injectable()
export class GameResultsService {
  private readonly logger = new Logger(GameResultsService.name);

  constructor(
    @InjectRepository(GameResult)
    private gameResultsRepository: Repository<GameResult>,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Calculate final score based on game data, time spent, and any other factors
   */
  calculateFinalScore(gameData: any, timeSpent: number): number {
    // Implement your scoring algorithm based on your game's logic
    // Example: Base score from game + time bonus + achievement bonus
    let finalScore = gameData.baseScore || 0;

    // Time bonus (example: faster completion = higher bonus)
    const timeBonus = Math.max(1000 - timeSpent, 0) * 0.1;
    finalScore += timeBonus;

    // Achievement bonus
    if (gameData.achievements && Array.isArray(gameData.achievements)) {
      const achievementBonus = gameData.achievements.length * 50;
      finalScore += achievementBonus;
    }

    // Round to integer
    return Math.round(finalScore);
  }

  /**
   * Create and store a new game result
   */
  async createResult(
    createGameResultDto: CreateGameResultDto,
  ): Promise<GameResult> {
    // Calculate final score if not provided
    if (!createGameResultDto.score) {
      createGameResultDto.score = this.calculateFinalScore(
        createGameResultDto.gameData,
        createGameResultDto.timeSpent,
      );
    }

    // Derive per-player answer stats from game data when not explicitly provided
    const stats = this.extractPlayerStats(createGameResultDto.gameData);
    createGameResultDto.correctAnswers =
      createGameResultDto.correctAnswers ?? stats.correctAnswers;
    createGameResultDto.totalAnswers =
      createGameResultDto.totalAnswers ?? stats.totalAnswers;

    // Create and save the entity
    const gameResult = this.gameResultsRepository.create(createGameResultDto);
    const savedResult = await this.gameResultsRepository.save(gameResult);

    // Emit event for other parts of the system
    this.eventEmitter.emit(
      'game.result.created',
      new GameResultCreatedEvent(
        savedResult.userId,
        savedResult.gameId,
        savedResult.score,
        savedResult.achievements || [],
        savedResult.correctAnswers ?? 0,
        savedResult.totalAnswers ?? 0,
      ),
    );

    this.logger.log(
      `Game result created for user ${savedResult.userId} with score ${savedResult.score}`,
    );

    return savedResult;
  }

  /**
   * Extract correct/total answer counts from arbitrary game data payloads.
   * Supports a few common shapes so callers don't have to normalize.
   */
  private extractPlayerStats(gameData: any): {
    correctAnswers: number;
    totalAnswers: number;
  } {
    if (!gameData || typeof gameData !== 'object') {
      return { correctAnswers: 0, totalAnswers: 0 };
    }

    const correctAnswers =
      gameData.correctAnswers ??
      gameData.correct_answers ??
      (Array.isArray(gameData.answers)
        ? gameData.answers.filter((a: any) => a && a.correct).length
        : 0);

    const totalAnswers =
      gameData.totalAnswers ??
      gameData.total_answers ??
      (Array.isArray(gameData.answers) ? gameData.answers.length : 0);

    return {
      correctAnswers: Number(correctAnswers) || 0,
      totalAnswers: Number(totalAnswers) || 0,
    };
  }

  /**
   * Generate a leaderboard for a specific game
   */
  async generateLeaderboard(
    gameId: string,
    limit = 10,
  ): Promise<LeaderboardEntryDto[]> {
    // Get top scores for the specified game
    const results = await this.gameResultsRepository.find({
      where: { gameId },
      order: { score: 'DESC' },
      take: limit,
    });

    // Transform into leaderboard entries with ranks
    const leaderboard = await Promise.all(
      results.map(async (result, index) => {
        // In a real app, you might want to fetch username from a user service
        // This is a simplified example
        const username = `User_${result.userId.substring(0, 6)}`;

        const entry: LeaderboardEntryDto = {
          userId: result.userId,
          username,
          score: result.score,
          rank: index + 1,
          achievements: result.achievements || [],
          gameId: result.gameId,
          correctAnswers: result.correctAnswers ?? 0,
          totalAnswers: result.totalAnswers ?? 0,
          accuracy: this.computeAccuracy(result.correctAnswers, result.totalAnswers),
        };

        return entry;
      }),
    );

    return leaderboard;
  }

  /**
   * Compute accuracy as a 0..1 ratio, guarding against divide-by-zero.
   */
  private computeAccuracy(
    correctAnswers?: number | null,
    totalAnswers?: number | null,
  ): number {
    const total = totalAnswers ?? 0;
    if (total <= 0) return 0;
    return (correctAnswers ?? 0) / total;
  }

  /**
   * Get user's personal best for a specific game
   */
  async getUserBest(
    userId: string,
    gameId: string,
  ): Promise<GameResult | null> {
    return this.gameResultsRepository.findOne({
      where: { userId, gameId },
      order: { score: 'DESC' },
    });
  }

  /**
   * Get all results for a specific user
   */
  async getUserResults(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<GameResult[]> {
    const offset = (page - 1) * limit;
    return this.gameResultsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });
  }

  /**
   * Aggregate per-player stats for a user across all games.
   * Returns totals required by the profile page and leaderboard.
   */
  async getUserStats(userId: string): Promise<{
    totalPoints: number;
    correctAnswers: number;
    totalAnswers: number;
    bestRoundScore: number;
    rounds: number;
    accuracy: number;
  }> {
    const raw = await this.gameResultsRepository
      .createQueryBuilder('gr')
      .select('COALESCE(SUM(gr.score), 0)', 'totalPoints')
      .addSelect('COALESCE(SUM(gr.correctAnswers), 0)', 'correctAnswers')
      .addSelect('COALESCE(SUM(gr.totalAnswers), 0)', 'totalAnswers')
      .addSelect('COALESCE(MAX(gr.score), 0)', 'bestRoundScore')
      .addSelect('COUNT(gr.id)', 'rounds')
      .where('gr.userId = :userId', { userId })
      .getRawOne<{
        totalPoints: string;
        correctAnswers: string;
        totalAnswers: string;
        bestRoundScore: string;
        rounds: string;
      }>();

    const totalPoints = Number(raw?.totalPoints) || 0;
    const correctAnswers = Number(raw?.correctAnswers) || 0;
    const totalAnswers = Number(raw?.totalAnswers) || 0;
    const bestRoundScore = Number(raw?.bestRoundScore) || 0;
    const rounds = Number(raw?.rounds) || 0;

    return {
      totalPoints,
      correctAnswers,
      totalAnswers,
      bestRoundScore,
      rounds,
      accuracy: this.computeAccuracy(correctAnswers, totalAnswers),
    };
  }
}
