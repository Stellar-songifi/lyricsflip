import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Lifecycle of a flag in the moderation queue.
 *
 * PENDING  → initial state; awaiting admin review
 * REVIEWED → admin has examined and deemed legitimate (no action)
 * HIDDEN   → admin has hidden the entry from public leaderboards
 * BANNED   → address is blocked from new rounds (future enforcement hook)
 */
export enum ModerationStatus {
  PENDING = 'pending',
  REVIEWED = 'reviewed',
  HIDDEN = 'hidden',
  BANNED = 'banned',
}

/**
 * Individual heuristic reasons that can appear in `PlayerFlag.reasons`.
 * These extend the existing `AntiCheatFlag` values in quick-game/anti-cheat.ts
 * with cross-round analytics-level signals.
 */
export enum AntiCheatFlagReason {
  /** Any correct answer arrived faster than 400 ms (sub-human). */
  IMPOSSIBLE_RESPONSE_TIME = 'impossible_response_time',
  /** 10+ consecutive correct answers all averaging under 1 500 ms. */
  PERFECT_STREAK = 'perfect_streak',
  /**
   * Accuracy > 95 % AND median answer time < 6 s across ≥ 20 cards.
   * Primary bot heuristic from the LF-357 spec.
   */
  HIGH_ACCURACY_LOW_LATENCY = 'high_accuracy_low_latency',
  /**
   * First answer in the round was submitted within the first ledger
   * (~5 s) of the round starting — consistent with reading the catalogue
   * from ledger state before the question is displayed.
   */
  FIRST_LEDGER_ANSWER = 'first_ledger_answer',
}

/**
 * Persistence of every heuristic flag raised against a Stellar address.
 *
 * One row is written per round evaluation when any heuristic fires, so the
 * history is queryable for audit and trend analysis. The admin moderation
 * queue is derived by aggregating these rows (see `PlayerFlagService`).
 *
 * On-chain data (game results, scores, wagers) is public and immutable; this
 * table records only the off-chain analytical decision, not the game data
 * itself.
 */
@Entity('player_flags')
@Index(['address', 'roundId'], { unique: true })
@Index(['status'])
@Index(['address'])
export class PlayerFlag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Stellar G… public key of the flagged player. Stored as the canonical
   * identifier because on-chain play is address-keyed.
   */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  address: string;

  /**
   * The round in which the suspicious behaviour was observed.
   * References `chain_round.round_id` by convention (no FK to avoid
   * coupling to the indexer schema).
   */
  @Column({ name: 'round_id', type: 'varchar', length: 128 })
  roundId: string;

  /**
   * JSON array of `AntiCheatFlagReason` values that fired for this round.
   * Stored as a simple-array for portability; use the DTO for display.
   */
  @Column({ type: 'simple-array' })
  reasons: string[];

  /**
   * Per-round answer count used to compute the heuristics.
   * Minimum threshold to flag is 20 (issue spec).
   */
  @Column({ name: 'total_answers', type: 'integer', default: 0 })
  totalAnswers: number;

  /** Correct answers in this round. */
  @Column({ name: 'correct_answers', type: 'integer', default: 0 })
  correctAnswers: number;

  /**
   * Accuracy = correctAnswers / totalAnswers, stored as a float for fast
   * range queries without recomputing in SQL.
   */
  @Column({ type: 'float', default: 0 })
  accuracy: number;

  /**
   * Median answer time in seconds, estimated from on-chain ledger deltas
   * (ledger ≈ 5 s cadence on Stellar).  Null when timing data is absent.
   */
  @Column({
    name: 'median_answer_time_s',
    type: 'float',
    nullable: true,
  })
  medianAnswerTimeS: number | null;

  /** Current moderation decision for this flag. */
  @Column({
    type: 'varchar',
    length: 32,
    default: ModerationStatus.PENDING,
  })
  status: ModerationStatus;

  /**
   * Free-text note added by the reviewer who last changed the status.
   * Nullable — only set when an admin takes action.
   */
  @Column({ name: 'reviewer_note', type: 'text', nullable: true })
  reviewerNote: string | null;

  /**
   * Stellar address (or user ID) of the admin who last updated the status.
   */
  @Column({ name: 'reviewed_by', type: 'varchar', length: 128, nullable: true })
  reviewedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
