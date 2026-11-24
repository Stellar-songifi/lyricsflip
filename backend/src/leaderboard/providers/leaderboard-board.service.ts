import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import {
  LEADERBOARD_METRICS,
  LEADERBOARD_WINDOWS,
  LeaderboardMetric,
  LeaderboardQueryDto,
  LeaderboardWindow,
  PaginatedLeaderboardDto,
  PlayerRankDto,
} from '../dto/leaderboard.dto';

// NOTE: deliberately not under the `leaderboard:` prefix, which the legacy
// cache invalidation in LeaderboardService wipes with a pattern delete.
const BOARD_KEY_PREFIX = 'lbboard:v2';
// Holds the UTC date (YYYY-MM-DD) the boards were last fully rebuilt for.
// Daily/weekly windows are anchored to UTC midnight, so a stale date means
// the boards describe the wrong window and must be rebuilt before serving.
const READY_KEY = `${BOARD_KEY_PREFIX}:ready`;

interface PlayerTotals {
  wins: number;
  points: number;
  streak: number;
}

/**
 * Leaderboards derived from the indexer tables (`chain_round_results`,
 * `chain_answers`, `chain_rounds`) and served from Redis sorted sets, one per
 * (window, metric). The database is the source of truth: boards are rebuilt
 * from it nightly, on first read after a restart/day change, and individual
 * players are re-derived (never incremented) when a round completes, so the
 * cache cannot drift.
 *
 * Metric definitions mirror the contract's `PlayerStats`:
 *  - wins:   rounds the player won. Like `finalize_round`, ties share the win
 *            (every player on the round's top score) and a 0-score round has
 *            no winner.
 *  - points: sum of the player's round scores.
 *  - streak: longest run of consecutive correct answers, ordered by
 *            (ledger, event_index). The contract also resets the streak when
 *            a card times out unanswered; that emits no answer event, so this
 *            can overstate `max_streak` for players who let cards time out.
 *            `wins` is exact, which is what the on-chain parity check uses.
 */
@Injectable()
export class LeaderboardBoardService {
  private readonly logger = new Logger(LeaderboardBoardService.name);
  private rebuilding: Promise<void> | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  async getBoard(query: LeaderboardQueryDto): Promise<PaginatedLeaderboardDto> {
    const window = query.window ?? 'all';
    const metric = query.metric ?? 'wins';
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    await this.ensureFresh();

    const key = this.boardKey(window, metric);
    const total = await this.redis.zcard(key);
    const start = (page - 1) * limit;
    const rows =
      start < total
        ? await this.redis.zrevrangeWithScores(key, start, start + limit - 1)
        : [];

    return {
      window,
      metric,
      data: rows.map((row, i) => ({
        rank: start + i + 1,
        address: row.member,
        score: row.score,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Position of one address on a board; null when it has never played.
  async getRank(
    address: string,
    window: LeaderboardWindow = 'all',
    metric: LeaderboardMetric = 'wins',
  ): Promise<PlayerRankDto | null> {
    await this.ensureFresh();

    const key = this.boardKey(window, metric);
    const [index, score, total] = await Promise.all([
      this.redis.zrevrank(key, address),
      this.redis.zscore(key, address),
      this.redis.zcard(key),
    ]);
    if (index === null || score === null) return null;
    return { address, window, metric, rank: index + 1, score, total };
  }

  // Rebuilds every board from the database, replacing whatever is cached.
  // Concurrent callers share one in-flight rebuild.
  rebuildAll(now: Date = new Date()): Promise<void> {
    if (!this.rebuilding) {
      this.rebuilding = this.doRebuild(now).finally(() => {
        this.rebuilding = null;
      });
    }
    return this.rebuilding;
  }

  // 00:00 UTC, which is also when the daily/weekly windows roll over.
  @Cron('0 0 * * *', { timeZone: 'UTC', name: 'leaderboard-nightly-rebuild' })
  async nightlyRebuild(): Promise<void> {
    try {
      await this.rebuildAll();
      this.logger.log('Nightly leaderboard rebuild complete');
    } catch (error) {
      this.logger.error(
        `Nightly leaderboard rebuild failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  // The indexer emits this when it decodes RoundCompleted. Re-derive every
  // participant's totals from the database and overwrite their board entries.
  @OnEvent('round.completed')
  async handleRoundCompleted(event: { roundId?: string }): Promise<void> {
    if (!event?.roundId) return;
    try {
      const rows: { player: string }[] = await this.dataSource.query(
        `SELECT DISTINCT player FROM chain_round_results WHERE round_id = $1`,
        [event.roundId],
      );
      await this.refreshPlayers(rows.map((r) => r.player));
    } catch (error) {
      this.logger.error(
        `Failed to refresh leaderboard for round ${event.roundId}: ${(error as Error).message}`,
      );
    }
  }

  // Recomputes the given players for every board and sets (never increments)
  // their scores, so it is idempotent. Skipped while the boards are not built
  // for today: the next read rebuilds from scratch and includes these players.
  async refreshPlayers(
    addresses: string[],
    now: Date = new Date(),
  ): Promise<void> {
    if (addresses.length === 0) return;
    if ((await this.redis.get(READY_KEY)) !== this.utcDate(now)) return;

    for (const window of LEADERBOARD_WINDOWS) {
      const totals = await this.computeTotals(
        this.windowStart(window, now),
        addresses,
      );
      for (const metric of LEADERBOARD_METRICS) {
        const key = this.boardKey(window, metric);
        await this.redis.zaddMany(
          key,
          [...totals].map(([member, t]) => ({ member, score: t[metric] })),
        );
        // No activity left in this window for the player: drop stale entry.
        await this.redis.zrem(
          key,
          addresses.filter((a) => !totals.has(a)),
        );
      }
    }
  }

  private async ensureFresh(): Promise<void> {
    const now = new Date();
    if ((await this.redis.get(READY_KEY)) === this.utcDate(now)) return;
    await this.rebuildAll(now);
  }

  private async doRebuild(now: Date): Promise<void> {
    for (const window of LEADERBOARD_WINDOWS) {
      const totals = await this.computeTotals(this.windowStart(window, now));
      for (const metric of LEADERBOARD_METRICS) {
        await this.redis.replaceSortedSet(
          this.boardKey(window, metric),
          [...totals].map(([member, t]) => ({ member, score: t[metric] })),
        );
      }
    }
    await this.redis.set(READY_KEY, this.utcDate(now));
  }

  // Per-player totals for one window, optionally limited to some players.
  // Every player with a round result in the window appears, even with zero
  // wins/points/streak, so they get a rank on every board.
  private async computeTotals(
    since: Date | null,
    players: string[] | null = null,
  ): Promise<Map<string, PlayerTotals>> {
    const params = [since, players];

    const results: { address: string; wins: number; points: string }[] =
      await this.dataSource.query(
        `
        WITH round_time AS (
          SELECT contract_id, round_id, MAX(ended_at) AS ended_at
            FROM chain_rounds
           GROUP BY contract_id, round_id
        ),
        results AS (
          SELECT crr.player,
                 crr.score,
                 COALESCE(rt.ended_at, crr.created_at) AS played_at,
                 MAX(crr.score) OVER (
                   PARTITION BY crr.contract_id, crr.round_id
                 ) AS top_score
            FROM chain_round_results crr
            LEFT JOIN round_time rt
              ON rt.contract_id = crr.contract_id AND rt.round_id = crr.round_id
           WHERE $2::text[] IS NULL
              OR (crr.contract_id, crr.round_id) IN (
                   SELECT contract_id, round_id
                     FROM chain_round_results
                    WHERE player = ANY($2::text[])
                 )
        )
        SELECT player AS address,
               COUNT(*) FILTER (WHERE score > 0 AND score = top_score)::int AS wins,
               COALESCE(SUM(score), 0)::bigint AS points
          FROM results
         WHERE ($1::timestamptz IS NULL OR played_at >= $1::timestamptz)
           AND ($2::text[] IS NULL OR player = ANY($2::text[]))
         GROUP BY player
        `,
        params,
      );

    const streaks: { address: string; streak: number }[] =
      await this.dataSource.query(
        `
        WITH round_time AS (
          SELECT contract_id, round_id, MAX(ended_at) AS ended_at
            FROM chain_rounds
           GROUP BY contract_id, round_id
        ),
        answers AS (
          SELECT a.player, a.correct, a.ledger, a.event_index,
                 COALESCE(rt.ended_at, a.created_at) AS played_at
            FROM chain_answers a
            LEFT JOIN round_time rt
              ON rt.contract_id = a.contract_id AND rt.round_id = a.round_id
           WHERE $2::text[] IS NULL OR a.player = ANY($2::text[])
        ),
        numbered AS (
          SELECT player, correct,
                 ROW_NUMBER() OVER (
                   PARTITION BY player ORDER BY ledger, event_index
                 ) - ROW_NUMBER() OVER (
                   PARTITION BY player, correct ORDER BY ledger, event_index
                 ) AS grp
            FROM answers
           WHERE $1::timestamptz IS NULL OR played_at >= $1::timestamptz
        ),
        runs AS (
          SELECT player, COUNT(*) AS run
            FROM numbered
           WHERE correct
           GROUP BY player, grp
        )
        SELECT player AS address, MAX(run)::int AS streak
          FROM runs
         GROUP BY player
        `,
        params,
      );

    const streakByPlayer = new Map(
      streaks.map((s) => [s.address, Number(s.streak)]),
    );
    const totals = new Map<string, PlayerTotals>();
    for (const row of results) {
      totals.set(row.address, {
        wins: Number(row.wins),
        points: Number(row.points),
        streak: streakByPlayer.get(row.address) ?? 0,
      });
    }
    return totals;
  }

  // daily: since 00:00 UTC today. weekly: the last 7 UTC days including
  // today. Both only move at UTC midnight, matching the nightly rebuild.
  private windowStart(window: LeaderboardWindow, now: Date): Date | null {
    const midnight = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    if (window === 'daily') return new Date(midnight);
    if (window === 'weekly') return new Date(midnight - 6 * 86_400_000);
    return null;
  }

  private utcDate(now: Date): string {
    return now.toISOString().slice(0, 10);
  }

  private boardKey(
    window: LeaderboardWindow,
    metric: LeaderboardMetric,
  ): string {
    return `${BOARD_KEY_PREFIX}:${window}:${metric}`;
  }
}
