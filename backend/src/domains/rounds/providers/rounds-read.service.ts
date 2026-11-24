import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ChainRound,
  ChainRoundPlayer,
  ChainRoundResult,
} from '../../../indexer/entities/indexer-state.entity';
import { RedisService } from '../../../redis/redis.service';
import {
  ChainPlayerStatsDto,
  OpenRoundDto,
  OpenRoundsQueryDto,
  PaginatedOpenRoundsDto,
  RoundDetailDto,
  RoundPlayerDto,
  RoundPlayerResultDto,
} from '../dto/rounds-read.dto';

// ─── Cache configuration ─────────────────────────────────────────────────────

/**
 * Short TTL: open-round data changes frequently (joins, starts, cancels).
 * 10 s is a good balance — the lobby is expected to be fresh within 10 s
 * (from the existing `OPEN_ROUNDS_POLL_MS = 10_000` in the frontend hook).
 */
const OPEN_ROUNDS_TTL_S = 10;

/**
 * Round-detail pages are less volatile than the lobby list; 15 s is fine.
 * Invalidated eagerly on `round.started` / `round.completed` / `round.cancelled`.
 */
const ROUND_DETAIL_TTL_S = 15;

/**
 * Player stats aggregate across all indexed rounds; invalidated on
 * `round.completed`.
 */
const PLAYER_STATS_TTL_S = 30;

const CACHE_KEY = {
  openRounds: (page: number, limit: number, genre?: string) =>
    `rounds:open:${genre ?? 'all'}:${page}:${limit}`,
  round: (roundId: string) => `rounds:detail:${roundId}`,
  playerStats: (address: string) => `rounds:player-stats:${address}`,
} as const;

// ─── Status values written by the indexer ────────────────────────────────────

/**
 * Status strings as stored in `chain_round.status` by the indexer.
 * The contract lifecycle is: open → started → completed | cancelled.
 */
const OPEN_STATUSES: readonly string[] = ['open'];
const TERMINAL_STATUSES: readonly string[] = ['completed', 'cancelled'];

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * RoundsReadService serves three public read endpoints backed by the
 * indexer's on-chain mirror tables and a Redis read-through cache:
 *
 *   GET /api/v1/rounds/open          → open lobby list
 *   GET /api/v1/rounds/:id           → full round detail + results
 *   GET /api/v1/players/:address/stats → per-player aggregate stats
 *
 * No Soroban RPC calls are made here. All data comes from tables that the
 * IndexerService keeps up to date:
 *   chain_round, chain_round_player, chain_round_result.
 *
 * Cache invalidation is event-driven: the indexer emits domain events
 * (`round.started`, `round.completed`, `round.cancelled`) which this service
 * listens to via `@OnEvent`, clearing only the affected keys.
 */
@Injectable()
export class RoundsReadService {
  private readonly logger = new Logger(RoundsReadService.name);

  constructor(
    @InjectRepository(ChainRound)
    private readonly roundRepo: Repository<ChainRound>,

    @InjectRepository(ChainRoundPlayer)
    private readonly playerRepo: Repository<ChainRoundPlayer>,

    @InjectRepository(ChainRoundResult)
    private readonly resultRepo: Repository<ChainRoundResult>,

    private readonly redisService: RedisService,
  ) {}

  // ─── Open rounds (lobby list) ─────────────────────────────────────────────

  /**
   * Returns a paginated list of joinable (open) rounds, with their current
   * player roster. Served from Redis when cached; otherwise queries the
   * indexer tables and writes the result back with a short TTL.
   */
  async getOpenRounds(
    query: OpenRoundsQueryDto,
  ): Promise<PaginatedOpenRoundsDto> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 50);
    const genre = query.genre;

    const cacheKey = CACHE_KEY.openRounds(page, limit, genre);
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as PaginatedOpenRoundsDto;
    }

    // Build the query against chain_round
    const qb = this.roundRepo
      .createQueryBuilder('r')
      .where('r.status IN (:...statuses)', { statuses: OPEN_STATUSES })
      .orderBy('r.created_ledger', 'DESC');

    if (genre) {
      qb.andWhere('r.genre = :genre', { genre });
    }

    const total = await qb.getCount();
    const rounds = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    // Fetch players for each round in parallel
    const playersByRound = await this.fetchPlayersByRoundIds(
      rounds.map((r) => r.roundId),
    );

    const data: OpenRoundDto[] = rounds.map((round) =>
      this.toOpenRoundDto(round, playersByRound[round.roundId] ?? []),
    );

    const result: PaginatedOpenRoundsDto = {
      data,
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    };

    await this.redisService.set(cacheKey, JSON.stringify(result), OPEN_ROUNDS_TTL_S);
    return result;
  }

  // ─── Round detail ─────────────────────────────────────────────────────────

  /**
   * Returns the full detail for a single round: status, genre, players,
   * and final per-player results (if completed).
   */
  async getRoundById(roundId: string): Promise<RoundDetailDto> {
    const cacheKey = CACHE_KEY.round(roundId);
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as RoundDetailDto;
    }

    const round = await this.roundRepo.findOneBy({ roundId });
    if (!round) {
      throw new NotFoundException(`Round ${roundId} not found`);
    }

    const [players, results] = await Promise.all([
      this.playerRepo.findBy({ roundId }),
      this.resultRepo.findBy({ roundId }),
    ]);

    const dto = this.toRoundDetailDto(round, players, results);

    // Don't cache rounds that are still in an open/active state with a long
    // TTL — they change more frequently. Use a shorter TTL.
    const ttl = TERMINAL_STATUSES.includes(round.status ?? '')
      ? ROUND_DETAIL_TTL_S * 10 // completed rounds are stable; cache longer
      : ROUND_DETAIL_TTL_S;

    await this.redisService.set(cacheKey, JSON.stringify(dto), ttl);
    return dto;
  }

  // ─── Player stats ─────────────────────────────────────────────────────────

  /**
   * Returns aggregate stats for a Stellar address derived from indexed
   * `chain_round_result` rows. This endpoint replaces the leaderboard
   * profile page's RPC calls for public player stats views.
   */
  async getPlayerStats(address: string): Promise<ChainPlayerStatsDto> {
    const cacheKey = CACHE_KEY.playerStats(address);
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as ChainPlayerStatsDto;
    }

    const row = await this.resultRepo
      .createQueryBuilder('r')
      .select('COUNT(*)', 'roundsPlayed')
      .addSelect('SUM(CASE WHEN r.won THEN 1 ELSE 0 END)', 'roundsWon')
      .addSelect('COALESCE(SUM(r.correctAnswers), 0)', 'correctAnswers')
      .addSelect('COALESCE(SUM(r.totalAnswers), 0)', 'totalAnswers')
      .addSelect('COALESCE(SUM(r.points), 0)', 'totalPoints')
      .addSelect('COALESCE(MAX(r.streakAfter), 0)', 'maxStreak')
      .addSelect('COALESCE(MAX(r.points), 0)', 'bestRoundScore')
      .where('r.player = :address', { address })
      .getRawOne();

    const roundsPlayed = Number(row?.roundsPlayed ?? 0);
    const roundsWon = Number(row?.roundsWon ?? 0);
    const correctAnswers = Number(row?.correctAnswers ?? 0);
    const totalAnswers = Number(row?.totalAnswers ?? 0);

    const dto: ChainPlayerStatsDto = {
      address,
      roundsPlayed,
      roundsWon,
      winRate: roundsPlayed > 0 ? roundsWon / roundsPlayed : 0,
      accuracy: totalAnswers > 0 ? correctAnswers / totalAnswers : 0,
      correctAnswers,
      totalAnswers,
      totalPoints: Number(row?.totalPoints ?? 0),
      maxStreak: Number(row?.maxStreak ?? 0),
      bestRoundScore: Number(row?.bestRoundScore ?? 0),
    };

    await this.redisService.set(cacheKey, JSON.stringify(dto), PLAYER_STATS_TTL_S);
    return dto;
  }

  // ─── Cache invalidation (event-driven) ───────────────────────────────────

  /**
   * Any round lifecycle change could make the open-rounds list stale.
   * Clear it eagerly so the lobby stays accurate within one poll interval.
   */
  @OnEvent('round.created')
  @OnEvent('round.joined')
  @OnEvent('round.started')
  @OnEvent('round.cancelled')
  async handleLobbyEvent(payload: { roundId?: string }): Promise<void> {
    // Clear the full open-rounds list (all pages/genres).
    await this.redisService.delPattern('rounds:open:*');

    // Clear the detail entry for the specific round if we have its ID.
    if (payload?.roundId) {
      await this.redisService.del(CACHE_KEY.round(payload.roundId));
    }
  }

  /**
   * On round completion: clear the open list, the detail cache for that
   * round, and all player stats involved (they now have new aggregate rows).
   */
  @OnEvent('round.completed')
  async handleRoundCompleted(payload: {
    roundId?: string;
    results?: Array<{ playerId: string }>;
  }): Promise<void> {
    await this.redisService.delPattern('rounds:open:*');

    if (payload?.roundId) {
      await this.redisService.del(CACHE_KEY.round(payload.roundId));
    }

    // Invalidate stats for every player who participated.
    if (Array.isArray(payload?.results)) {
      await Promise.all(
        payload.results.map((r) =>
          this.redisService.del(CACHE_KEY.playerStats(r.playerId)),
        ),
      );
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async fetchPlayersByRoundIds(
    roundIds: string[],
  ): Promise<Record<string, ChainRoundPlayer[]>> {
    if (roundIds.length === 0) return {};
    const players = await this.playerRepo
      .createQueryBuilder('p')
      .where('p.roundId IN (:...roundIds)', { roundIds })
      .getMany();

    return players.reduce<Record<string, ChainRoundPlayer[]>>((acc, p) => {
      (acc[p.roundId] ??= []).push(p);
      return acc;
    }, {});
  }

  private toPlayerDto(p: ChainRoundPlayer): RoundPlayerDto {
    return {
      address: p.player,
      ready: p.ready,
      joinedLedger: p.joinedLedger,
    };
  }

  private toOpenRoundDto(
    round: ChainRound,
    players: ChainRoundPlayer[],
  ): OpenRoundDto {
    return {
      roundId: round.roundId,
      admin: round.admin,
      status: round.status,
      genre: round.genre,
      players: players.map((p) => this.toPlayerDto(p)),
      playerCount: players.length,
      createdLedger: round.createdLedger,
      startedAt: round.startedAt?.toISOString() ?? null,
    };
  }

  private toRoundDetailDto(
    round: ChainRound,
    players: ChainRoundPlayer[],
    results: ChainRoundResult[],
  ): RoundDetailDto {
    const resultDtos: RoundPlayerResultDto[] = results.map((r) => ({
      address: r.player,
      won: r.won,
      points: r.points,
      correctAnswers: r.correctAnswers,
      totalAnswers: r.totalAnswers,
      streakAfter: r.streakAfter,
      ledger: r.ledger,
    }));

    return {
      roundId: round.roundId,
      admin: round.admin,
      status: round.status,
      genre: round.genre,
      players: players.map((p) => this.toPlayerDto(p)),
      playerCount: players.length,
      createdLedger: round.createdLedger,
      startedAt: round.startedAt?.toISOString() ?? null,
      completedAt: round.completedAt?.toISOString() ?? null,
      txHash: round.txHash,
      results: resultDtos,
    };
  }
}
