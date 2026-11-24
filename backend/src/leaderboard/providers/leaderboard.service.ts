import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { RedisService } from '../../redis/redis.service';
import { LeaderboardRoundResult } from '../entities/leaderboard-round-result.entity';
import { LeaderboardBoardService } from './leaderboard-board.service';
import {
  PlayerBadgeDto,
  PlayerProfileDto,
  PlayerRecentRoundDto,
} from '../dto/player-profile.dto';

// Short TTL: the leaderboard is meant to reflect the last few completed
// rounds fairly promptly, and cache invalidation on 'round.completed'
// already clears it on write, so this mostly protects against read bursts.
const CACHE_TTL_SECONDS = 30;
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
    private readonly boardService: LeaderboardBoardService,
  ) {}

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

    const rank = await this.boardService.getRank(address, 'all', 'points');

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
  // recordRoundResult. Invalidate eagerly so a stale profile is never served
  // past this point, even before those rows land. (The ranked boards are
  // refreshed separately by LeaderboardBoardService.)
  @OnEvent('round.completed')
  async handleRoundCompleted(): Promise<void> {
    await this.invalidateCache();
  }

  private async invalidateCache(): Promise<void> {
    await this.redisService.delPattern(`${PROFILE_CACHE_KEY_PREFIX}:*`);
  }
}
