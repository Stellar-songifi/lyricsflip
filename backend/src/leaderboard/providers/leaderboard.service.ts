import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { RedisService } from '../../redis/redis.service';
import { LeaderboardRoundResult } from '../entities/leaderboard-round-result.entity';
import {
  LeaderboardEntryDto,
  LeaderboardPeriod,
  LeaderboardQueryDto,
  PaginatedLeaderboardDto,
} from '../dto/leaderboard.dto';

// Short TTL: the leaderboard is meant to reflect the last few completed
// rounds fairly promptly, and cache invalidation on 'round.completed'
// already clears it on write, so this mostly protects against read bursts.
const CACHE_TTL_SECONDS = 30;
const CACHE_KEY_PREFIX = 'leaderboard';

export interface RecordRoundResultInput {
  roundId: string;
  playerId: string;
  address?: string;
  username: string;
  genre: string;
  won: boolean;
  streakAfter?: number;
}

@Injectable()
export class LeaderboardService {
  constructor(
    @InjectRepository(LeaderboardRoundResult)
    private readonly roundResultRepository: Repository<LeaderboardRoundResult>,
    private readonly redisService: RedisService,
  ) {}

  // Retrieves a page of the leaderboard, ranked by rounds won, for a
  // period/genre combination. Backed by an aggregation over indexed round
  // results (see LeaderboardRoundResult) rather than a running total, so
  // any period/genre combination can be served without a separate job per
  // bucket.
  async getLeaderboard(
    query: LeaderboardQueryDto,
  ): Promise<PaginatedLeaderboardDto> {
    const period = query.period ?? 'all';
    const genre = query.genre;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const cacheKey = this.cacheKey(period, genre, page, limit);
    const cached = await this.redisService.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const qb = this.roundResultRepository
      .createQueryBuilder('r')
      .select('r.playerId', 'playerId')
      .addSelect('COALESCE(MAX(r.address), MAX(r.playerId))', 'address')
      .addSelect('MAX(r.username)', 'username')
      .addSelect('COUNT(*)', 'roundsPlayed')
      .addSelect('SUM(CASE WHEN r.won THEN 1 ELSE 0 END)', 'roundsWon')
      .addSelect('MAX(r.streakAfter)', 'maxStreak')
      .groupBy('r.playerId')
      .orderBy('"roundsWon"', 'DESC')
      .addOrderBy('"roundsPlayed"', 'ASC')
      .addOrderBy('MAX(r.username)', 'ASC');

    if (genre) {
      qb.andWhere('r.genre = :genre', { genre });
    }
    const periodStart = this.periodStart(period);
    if (periodStart) {
      qb.andWhere('r.playedAt >= :periodStart', { periodStart });
    }

    const rows = await qb.getRawMany();
    const total = rows.length;
    const offset = (page - 1) * limit;
    const data: LeaderboardEntryDto[] = rows
      .slice(offset, offset + limit)
      .map((row, index) => {
        const roundsPlayed = Number(row.roundsPlayed);
        const roundsWon = Number(row.roundsWon);
        return {
          rank: offset + index + 1,
          address: row.address,
          username: row.username,
          roundsWon,
          winRate: roundsPlayed > 0 ? roundsWon / roundsPlayed : 0,
          maxStreak: Number(row.maxStreak),
        };
      });

    const result: PaginatedLeaderboardDto = {
      data,
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    };
    await this.redisService.set(
      cacheKey,
      JSON.stringify(result),
      CACHE_TTL_SECONDS,
    );
    return result;
  }

  // Rank of a single player on the all-time, all-genre leaderboard.
  async getPlayerRank(
    playerId: string,
  ): Promise<{ playerId: string; rank: number } | null> {
    const leaderboard = await this.getLeaderboard({
      period: 'all',
      page: 1,
      limit: 10000,
    });
    const entry = leaderboard.data.find((e) => e.address === playerId);
    return entry ? { playerId, rank: entry.rank } : null;
  }

  // Appends one round result. Intended to be called by the indexer
  // (LF-088) as it decodes 'RoundCompleted' events into per-player rows.
  async recordRoundResult(
    input: RecordRoundResultInput,
  ): Promise<LeaderboardRoundResult> {
    const result = this.roundResultRepository.create({
      roundId: input.roundId,
      playerId: input.playerId,
      address: input.address ?? input.playerId,
      username: input.username,
      genre: input.genre,
      won: input.won,
      streakAfter: input.streakAfter ?? 0,
    });
    const saved = await this.roundResultRepository.save(result);
    await this.invalidateCache();
    return saved;
  }

  // The indexer emits a coarse 'round.completed' event as soon as it decodes
  // the on-chain event, ahead of resolving it into per-player rows via
  // recordRoundResult. Invalidate eagerly so a stale page is never served
  // past this point, even before those rows land.
  @OnEvent('round.completed')
  async handleRoundCompleted(): Promise<void> {
    await this.invalidateCache();
  }

  private async invalidateCache(): Promise<void> {
    await this.redisService.delPattern(`${CACHE_KEY_PREFIX}:*`);
  }

  private cacheKey(
    period: LeaderboardPeriod,
    genre: string | undefined,
    page: number,
    limit: number,
  ): string {
    return `${CACHE_KEY_PREFIX}:${period}:${genre ?? 'all'}:${page}:${limit}`;
  }

  private periodStart(period: LeaderboardPeriod): Date | null {
    const now = new Date();
    if (period === 'daily') {
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
    }
    if (period === 'weekly') {
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() - 7);
      return start;
    }
    return null;
  }
}
