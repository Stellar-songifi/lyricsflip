import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Audit log of every referral-reward credit issued (LF-355).
 *
 * One row per (referrerId, refereeId, roundId) tuple — the unique index
 * prevents double-issuing if the event is replayed.  Used by the anti-abuse
 * daily-cap check: count rows WHERE referrerId = :id AND createdAt >= today.
 */
@Entity('referral_credits')
@Index('IDX_referral_credits_referrer_day', ['referrerId', 'creditedAt'])
@Index(
  'IDX_referral_credits_referrer_referee_round',
  ['referrerId', 'refereeId', 'roundId'],
  { unique: true },
)
export class ReferralCredit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** UUID of the user who gets the reward. */
  @Index()
  @Column({ type: 'uuid' })
  referrerId: string;

  /** UUID of the user whose first round triggered the credit. */
  @Index()
  @Column({ type: 'uuid' })
  refereeId: string;

  /**
   * On-chain round ID.  Together with referrerId and refereeId this forms the
   * natural key that prevents duplicate credits.
   */
  @Column({ type: 'varchar', length: 128 })
  roundId: string;

  /** Points awarded to the referrer for this credit. */
  @Column({ type: 'integer' })
  pointsAwarded: number;

  /**
   * Wall-clock timestamp of credit issuance — stored separately so the daily
   * cap query (`WHERE creditedAt >= today`) uses a plain date comparison
   * rather than CREATE_DATE timezone gymnastics.
   */
  @Index()
  @Column({ type: 'timestamptz' })
  creditedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
