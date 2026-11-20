import { User } from '../../user/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
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
