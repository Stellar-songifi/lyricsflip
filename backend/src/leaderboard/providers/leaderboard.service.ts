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
import {
  PlayerBadgeDto,
  PlayerProfileDto,
  PlayerRecentRoundDto,
} from '../dto/player-profile.dto';

// Short TTL: the leaderboard is meant to reflect the last few completed
// rounds fairly promptly, and cache invalidation on 'round.completed'
// already clears it on write, so this mostly protects against read bursts.
const CACHE_TTL_SECONDS = 30;
const CACHE_KEY_PREFIX = 'leaderboard';
const PROFILE_CACHE_KEY_PREFIX = 'player-profile';
const RECENT_ROUNDS_LIMIT = 20;

export interface RecordRoundResultInput {
  roundId: string;
  playerId: string;
  address?: string;
  username: string;
  genre: string;
  won: boolean;
  streakAfter?: number;
  points?: number;
  correctAnswers?: number;
  totalAnswers?: number;
}

@Injectable()
export class LeaderboardService {
  constructor(
    @InjectRepository(LeaderboardRoundResult)
    private readonly roundResultRepository: Repository<LeaderboardRoundResult>,
    private readonly redisService: RedisService,
  ) {}

  // Retrieves a page of the leaderboard for a period/genre combination,
  // ranked by total points with rounds won and accuracy as tie-breakers.
  // Backed by an aggregation over the indexed chain tables
  // (chain_round_results joined with chain_rounds for the genre) rather than
  // a running total, so any period/genre combination can be served without a
  // separate job per bucket.
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
      .innerJoin('chain_rounds', 'round', 'round.id = r.roundId')
      .select('r.playerAddress', 'address')
      .addSelect('MAX(r.username)', 'username')
      .addSelect('COUNT(*)', 'roundsPlayed')
      .addSelect('SUM(CASE WHEN r.won THEN 1 ELSE 0 END)', 'roundsWon')
      .addSelect('MAX(r.streakAfter)', 'maxStreak')
      .addSelect('COALESCE(SUM(r.points), 0)', 'totalPoints')
      .addSelect('COALESCE(SUM(r.correctAnswers), 0)', 'correctAnswers')
      .addSelect('COALESCE(SUM(r.totalAnswers), 0)', 'totalAnswers')
      .addSelect('COALESCE(MAX(r.points), 0)', 'bestRoundScore')
      .groupBy('r.playerAddress')
      .orderBy('"totalPoints"', 'DESC')
      .addOrderBy('"roundsWon"', 'DESC')
      .addOrderBy(
        'CASE WHEN COALESCE(SUM(r.totalAnswers), 0) > 0 ' +
          'THEN SUM(r.correctAnswers)::float / SUM(r.totalAnswers) ELSE 0 END',
        'DESC',
      )
      .addOrderBy('MAX(r.username)', 'ASC');

    if (genre) {
      qb.andWhere('round.genre = :genre', { genre });
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
        const correctAnswers = Number(row.correctAnswers);
        const totalAnswers = Number(row.totalAnswers);
        return {
          rank: offset + index + 1,
          address: row.address,
          username: row.username,
          roundsWon,
          winRate: roundsPlayed > 0 ? roundsWon / roundsPlayed : 0,
          maxStreak: Number(row.maxStreak),
          totalPoints: Number(row.totalPoints),
          correctAnswers,
          totalAnswers,
          accuracy: totalAnswers > 0 ? correctAnswers / totalAnswers : 0,
          bestRoundScore: Number(row.bestRoundScore),
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

  // Profile page payload for a single address: aggregate stats, recent
  // rounds, badges (from chain_nfts) and unclaimed winnings, all computed
  // from indexed tables so it can be paged and cached.
  async getPlayerProfile(address: string): Promise<PlayerProfileDto> {
    const cacheKey = `${PROFILE_CACHE_KEY_PREFIX}:${address}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const statsRow = await this.roundResultRepository
      .createQueryBuilder('r')
      .select('COUNT(*)', 'roundsPlayed')
      .addSelect('SUM(CASE WHEN r.won THEN 1 ELSE 0 END)', 'roundsWon')
      .addSelect('MAX(r.streakAfter)', 'maxStreak')
      .addSelect('COALESCE(SUM(r.points), 0)', 'totalPoints')
      .addSelect('COALESCE(SUM(r.correctAnswers), 0)', 'correctAnswers')
      .addSelect('COALESCE(SUM(r.totalAnswers), 0)', 'totalAnswers')
      .addSelect('COALESCE(MAX(r.points), 0)', 'bestRoundScore')
      .where('r.playerAddress = :address', { address })
      .getRawOne();

    const roundsPlayed = Number(statsRow?.roundsPlayed ?? 0);
    const roundsWon = Number(statsRow?.roundsWon ?? 0);
    const correctAnswers = Number(statsRow?.correctAnswers ?? 0);
    const totalAnswers = Number(statsRow?.totalAnswers ?? 0);

    const recentRows = await this.roundResultRepository
      .createQueryBuilder('r')
      .innerJoin('chain_rounds', 'round', 'round.id = r.roundId')
      .select('r.roundId', 'roundId')
      .addSelect('round.genre', 'genre')
      .addSelect('r.won', 'won')
      .addSelect('r.points', 'points')
      .addSelect('r.correctAnswers', 'correctAnswers')
      .addSelect('r.totalAnswers', 'totalAnswers')
      .addSelect('r.playedAt', 'playedAt')
      .where('r.playerAddress = :address', { address })
      .orderBy('r.playedAt', 'DESC')
      .limit(RECENT_ROUNDS_LIMIT)
      .getRawMany();

    const recentRounds: PlayerRecentRoundDto[] = recentRows.map((row) => ({
      roundId: row.roundId,
      genre: row.genre,
      won: Boolean(row.won),
      points: Number(row.points),
      correctAnswers: Number(row.correctAnswers),
      totalAnswers: Number(row.totalAnswers),
      playedAt: row.playedAt,
    }));

    const badgeRows = await this.roundResultRepository.manager.query(
      `SELECT nft.token_id AS "tokenId", nft.name AS "name", nft.image_url AS "imageUrl"
         FROM chain_nfts nft
        WHERE nft.owner_address = $1
        ORDER BY nft.token_id ASC`,
      [address],
    );
    const badges: PlayerBadgeDto[] = (badgeRows ?? []).map((row: any) => ({
      tokenId: String(row.tokenId),
      name: row.name,
      imageUrl: row.imageUrl,
    }));

    const winningsRow = await this.roundResultRepository.manager.query(
      `SELECT COALESCE(SUM(w.amount), 0) AS "unclaimed"
         FROM chain_winnings w
        WHERE w.player_address = $1 AND w.claimed = false`,
      [address],
    );
    const unclaimedWinnings = String(winningsRow?.[0]?.unclaimed ?? '0');

    const rank = await this.getPlayerRank(address);

    const profile: PlayerProfileDto = {
      address,
      rank: rank?.rank ?? null,
      stats: {
        roundsPlayed,
        roundsWon,
        winRate: roundsPlayed > 0 ? roundsWon / roundsPlayed : 0,
        maxStreak: Number(statsRow?.maxStreak ?? 0),
        totalPoints: Number(statsRow?.totalPoints ?? 0),
        correctAnswers,
        totalAnswers,
        accuracy: totalAnswers > 0 ? correctAnswers / totalAnswers : 0,
        bestRoundScore: Number(statsRow?.bestRoundScore ?? 0),
      },
      recentRounds,
      badges,
      unclaimedWinnings,
    };

    await this.redisService.set(
      cacheKey,
      JSON.stringify(profile),
      CACHE_TTL_SECONDS,
    );
    return profile;
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
      points: input.points ?? 0,
      correctAnswers: input.correctAnswers ?? 0,
      totalAnswers: input.totalAnswers ?? 0,
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
    await this.redisService.delPattern(`${PROFILE_CACHE_KEY_PREFIX}:*`);
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
    if (period === 'day' || period === 'daily') {
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
    }
    if (period === 'week' || period === 'weekly') {
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() - 7);
      return start;
    }
    return null;
  }
}
