import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AntiCheatFlagReason,
  ModerationStatus,
  PlayerFlag,
} from '../entities/player-flag.entity';
import {
  ChainAnswer,
  ChainRound,
  ChainRoundResult,
} from '../../indexer/entities/indexer-state.entity';

// ─── Heuristic thresholds ───────────────────────────────────────────────────

/** Minimum cards played before the cross-round heuristic fires (LF-357). */
export const MIN_CARDS_FOR_FLAG = 20;

/**
 * Accuracy threshold for the HIGH_ACCURACY_LOW_LATENCY heuristic.
 * >95 % correct across ≥ MIN_CARDS_FOR_FLAG answers triggers review.
 */
export const ACCURACY_THRESHOLD = 0.95;

/**
 * Median answer-time threshold in seconds (LF-357 spec: "under 6 s").
 * Derived from ledger deltas: Stellar closes a ledger roughly every 5 s.
 * An answer submitted in the same ledger as the round started yields
 * a delta of 0, well under this threshold.
 */
export const MEDIAN_ANSWER_TIME_THRESHOLD_S = 6;

/** Stellar average ledger close time in seconds (approximate). */
const LEDGER_CLOSE_TIME_S = 5;

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * AntiCheatService evaluates completed rounds for suspicious play.
 *
 * Data sources:
 *   - `chain_round`        → round start ledger (for first-ledger check)
 *   - `chain_answer`       → per-card answer correctness + ledger sequence
 *   - `chain_round_result` → aggregate correctAnswers / totalAnswers / points
 *
 * Timing is approximated from ledger deltas (ledgerDelta × 5 s), because
 * on-chain contracts record the submitting ledger, not a wall-clock time.
 * This is accurate enough for the bot detection use-case: a bot that answers
 * in ledger 0 or 1 will show delta ≤ 1, translating to ≤ 5 s — well below
 * the 6 s threshold.
 *
 * The service is triggered automatically via the `round.completed` event
 * emitted by the IndexerService, so no polling or cron is needed.
 */
@Injectable()
export class AntiCheatService {
  private readonly logger = new Logger(AntiCheatService.name);

  constructor(
    @InjectRepository(PlayerFlag)
    private readonly flagRepository: Repository<PlayerFlag>,

    @InjectRepository(ChainRound)
    private readonly chainRoundRepository: Repository<ChainRound>,

    @InjectRepository(ChainAnswer)
    private readonly chainAnswerRepository: Repository<ChainAnswer>,

    @InjectRepository(ChainRoundResult)
    private readonly chainRoundResultRepository: Repository<ChainRoundResult>,
  ) {}

  // ─── Event hook ─────────────────────────────────────────────────────────

  /**
   * Automatically called by the event emitter when the indexer records a
   * completed round. Evaluates every player in that round for suspicious
   * behaviour and persists any flags raised.
   *
   * Errors inside this handler are caught and logged — a flag evaluation
   * failure must never block the indexer pipeline.
   */
  @OnEvent('round.completed')
  async handleRoundCompleted(payload: { roundId: string }): Promise<void> {
    const roundId = payload?.roundId;
    if (!roundId) return;

    try {
      await this.evaluateRound(roundId);
    } catch (err) {
      this.logger.error(
        `Anti-cheat evaluation failed for round ${roundId}: ${err?.message}`,
        err?.stack,
      );
    }
  }

  // ─── Core evaluation ────────────────────────────────────────────────────

  /**
   * Evaluates all players who participated in `roundId` and writes
   * `PlayerFlag` rows for any addresses that trip a heuristic.
   *
   * Returns the list of flags persisted (may be empty).
   */
  async evaluateRound(roundId: string): Promise<PlayerFlag[]> {
    const round = await this.chainRoundRepository.findOneBy({ roundId });
    const roundStartLedger = round?.createdLedger ?? null;

    // Fetch per-player results for this round
    const results = await this.chainRoundResultRepository.findBy({ roundId });
    if (!results.length) return [];

    // Fetch all answers for this round in one query, then group in JS
    const allAnswers = await this.chainAnswerRepository.findBy({ roundId });
    const answersByPlayer = groupBy(allAnswers, (a) => a.player);

    const flags: PlayerFlag[] = [];

    for (const result of results) {
      const playerAnswers = answersByPlayer[result.player] ?? [];
      const reasons = this.computeReasons(
        result,
        playerAnswers,
        roundStartLedger,
      );

      if (reasons.length === 0) continue;

      const existing = await this.flagRepository.findOneBy({
        address: result.player,
        roundId,
      });
      if (existing) {
        // Update reasons if re-evaluated (idempotent)
        existing.reasons = reasons;
        existing.updatedAt = new Date();
        flags.push(await this.flagRepository.save(existing));
        continue;
      }

      const { accuracy, medianAnswerTimeS } = this.computeMetrics(
        result,
        playerAnswers,
        roundStartLedger,
      );

      const flag = this.flagRepository.create({
        address: result.player,
        roundId,
        reasons,
        totalAnswers: result.totalAnswers,
        correctAnswers: result.correctAnswers,
        accuracy,
        medianAnswerTimeS,
        status: ModerationStatus.PENDING,
        reviewerNote: null,
        reviewedBy: null,
      });

      flags.push(await this.flagRepository.save(flag));
      this.logger.warn(
        `Flagged player ${result.player} in round ${roundId}: ${reasons.join(', ')}`,
      );
    }

    return flags;
  }

  // ─── Heuristics ─────────────────────────────────────────────────────────

  /**
   * Runs all heuristics for a single player in a single round and returns
   * the set of reasons that fired (deduplicated).
   */
  private computeReasons(
    result: ChainRoundResult,
    answers: ChainAnswer[],
    roundStartLedger: number | null,
  ): AntiCheatFlagReason[] {
    const reasons = new Set<AntiCheatFlagReason>();

    // 1. PRIMARY — High accuracy + low median latency across ≥ 20 cards.
    //    Issue spec: "accuracy above 95% with a median answer time under 6 s
    //    across 20 or more cards."
    if (result.totalAnswers >= MIN_CARDS_FOR_FLAG) {
      const accuracy = result.totalAnswers > 0
        ? result.correctAnswers / result.totalAnswers
        : 0;

      const medianTimeS = this.medianLedgerDeltaSeconds(
        answers,
        roundStartLedger,
      );

      if (
        accuracy > ACCURACY_THRESHOLD &&
        medianTimeS !== null &&
        medianTimeS < MEDIAN_ANSWER_TIME_THRESHOLD_S
      ) {
        reasons.add(AntiCheatFlagReason.HIGH_ACCURACY_LOW_LATENCY);
      }
    }

    // 2. FIRST-LEDGER ANSWER — first answer submitted in the same ledger as
    //    the round was created (or the very next ledger), indicating the
    //    player read the catalogue from ledger state before play began.
    if (roundStartLedger !== null && answers.length > 0) {
      const correctAnswers = answers.filter((a) => a.correct);
      if (correctAnswers.length > 0) {
        const firstCorrect = correctAnswers.reduce((min, a) =>
          (a.ledger ?? Infinity) < (min.ledger ?? Infinity) ? a : min,
        );
        const delta = (firstCorrect.ledger ?? Infinity) - roundStartLedger;
        // delta ≤ 1 means answer arrived in the same or immediately following
        // ledger as the round started (~5 s or less).
        if (delta <= 1) {
          reasons.add(AntiCheatFlagReason.FIRST_LEDGER_ANSWER);
        }
      }
    }

    // 3. IMPOSSIBLE RESPONSE TIME — any correct answer with a ledger delta
    //    that maps to under 400 ms. Since a ledger closes every ~5 s, a
    //    delta of 0 means the answer arrived before or in the same ledger:
    //    sub-400 ms is implied by delta = 0 for a correct answer in a fresh
    //    round.
    if (roundStartLedger !== null) {
      const impossiblyFast = answers.some((a) => {
        if (!a.correct) return false;
        const deltaMs = ((a.ledger ?? roundStartLedger) - roundStartLedger)
          * LEDGER_CLOSE_TIME_S * 1000;
        // 400 ms threshold inherited from quick-game/anti-cheat.ts
        return deltaMs < 400;
      });
      if (impossiblyFast) {
        reasons.add(AntiCheatFlagReason.IMPOSSIBLE_RESPONSE_TIME);
      }
    }

    // 4. PERFECT STREAK — all answers correct and answers were very fast on
    //    average (average ledger delta < SUSPICIOUS_STREAK_AVG_S threshold).
    //    Mirrors the streak heuristic in quick-game/anti-cheat.ts but
    //    applied to on-chain data.
    if (answers.length >= 10 && result.correctAnswers === result.totalAnswers) {
      const avgDeltaS = this.averageLedgerDeltaSeconds(
        answers,
        roundStartLedger,
      );
      if (avgDeltaS !== null && avgDeltaS < 1.5) {
        reasons.add(AntiCheatFlagReason.PERFECT_STREAK);
      }
    }

    return Array.from(reasons);
  }

  // ─── Metric helpers ──────────────────────────────────────────────────────

  private computeMetrics(
    result: ChainRoundResult,
    answers: ChainAnswer[],
    roundStartLedger: number | null,
  ): { accuracy: number; medianAnswerTimeS: number | null } {
    const accuracy =
      result.totalAnswers > 0
        ? result.correctAnswers / result.totalAnswers
        : 0;
    const medianAnswerTimeS = this.medianLedgerDeltaSeconds(
      answers,
      roundStartLedger,
    );
    return { accuracy, medianAnswerTimeS };
  }

  /**
   * Computes the median answer time in seconds from ledger deltas.
   * Returns null if ledger data is unavailable for all answers.
   */
  private medianLedgerDeltaSeconds(
    answers: ChainAnswer[],
    roundStartLedger: number | null,
  ): number | null {
    if (roundStartLedger === null || answers.length === 0) return null;
    const deltas = answers
      .filter((a) => a.ledger !== null)
      .map((a) => (a.ledger! - roundStartLedger) * LEDGER_CLOSE_TIME_S);

    if (deltas.length === 0) return null;

    deltas.sort((a, b) => a - b);
    const mid = Math.floor(deltas.length / 2);
    return deltas.length % 2 === 0
      ? (deltas[mid - 1] + deltas[mid]) / 2
      : deltas[mid];
  }

  private averageLedgerDeltaSeconds(
    answers: ChainAnswer[],
    roundStartLedger: number | null,
  ): number | null {
    if (roundStartLedger === null || answers.length === 0) return null;
    const deltas = answers
      .filter((a) => a.ledger !== null)
      .map((a) => (a.ledger! - roundStartLedger) * LEDGER_CLOSE_TIME_S);

    if (deltas.length === 0) return null;
    return deltas.reduce((s, d) => s + d, 0) / deltas.length;
  }
}

// ─── Utility ────────────────────────────────────────────────────────────────

function groupBy<T>(
  items: T[],
  key: (item: T) => string,
): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {});
}
