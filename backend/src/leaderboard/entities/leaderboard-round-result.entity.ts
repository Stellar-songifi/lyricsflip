import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * One row per (round, player), written as rounds complete. The leaderboard
 * is computed on read by aggregating these rows over a time window (see
 * `LeaderboardService.getLeaderboard`), which is what lets `period` and
 * `genre` be combined freely without maintaining separate running totals
 * per bucket.
 *
 * Populated from indexed `RoundCompleted` events (see `IndexerService`,
 * LF-088) via `LeaderboardService.recordRoundResult`.
 */
@Entity('leaderboard_round_results')
@Index(['genre', 'playedAt'])
export class LeaderboardRoundResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  roundId: string;

  @Column()
  @Index()
  playerId: string;

  // Stellar account address, when known; falls back to playerId otherwise.
  @Column({ nullable: true })
  address: string;

  @Column()
  username: string;

  @Column()
  genre: string;

  @Column()
  won: boolean;

  // The player's answer streak immediately after this round.
  @Column({ type: 'int', default: 0 })
  streakAfter: number;

  @CreateDateColumn()
  playedAt: Date;
}
