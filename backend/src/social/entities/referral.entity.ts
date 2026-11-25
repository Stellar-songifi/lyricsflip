import { User } from '../../user/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ReferralStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
}

@Entity('referrals')
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  referralCode: string;

  @ManyToOne(() => User, (user) => user.referralsGiven)
  referrer: User;

  @Column()
  referrerId: string;

  @ManyToOne(() => User, (user) => user.referralsReceived, { nullable: true })
  referee: User;

  @Column({ nullable: true })
  refereeId: string;

  @Column({
    type: 'enum',
    enum: ReferralStatus,
    default: ReferralStatus.PENDING,
  })
  status: ReferralStatus;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  rewardDetails: {
    type: string;
    amount: number;
    status: 'pending' | 'distributed';
    distributedAt?: Date;
  };

  @Column({ default: false })
  isRewardDistributed: boolean;

  /**
   * The on-chain round ID whose finalization triggered this referral credit
   * (LF-355).  Null until the referral is completed.  Used to prevent
   * double-crediting: a referee's first qualifying round is recorded here and
   * any subsequent round events for the same referee are ignored.
   */
  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  firstRoundId: string | null;

  /**
   * Ledger number at which the referee's account first appeared on-chain, as
   * observed by the indexer (LF-355).  Null until the first RoundCompleted
   * event for this referee is processed.  Used by the minimum-account-age
   * anti-abuse check.
   */
  @Column({ type: 'integer', nullable: true })
  refereeJoinedLedger: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    conversionSource?: string;
    browserInfo?: string;
    ipAddress?: string;
  };
}
