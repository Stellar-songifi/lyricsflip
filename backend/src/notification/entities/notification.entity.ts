import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum NotificationType {
  ROUND_JOINED = 'ROUND_JOINED',
  ROUND_STARTED = 'ROUND_STARTED',
  ROUND_COMPLETED = 'ROUND_COMPLETED',
  ROUND_CANCELLED = 'ROUND_CANCELLED',
  ACHIEVEMENT_UNLOCKED = 'ACHIEVEMENT_UNLOCKED',
  FRIEND_REQUEST = 'FRIEND_REQUEST',
  SYSTEM = 'SYSTEM',
  NFT_MINTED = 'NFT_MINTED',
  REWARD_CLAIMED = 'REWARD_CLAIMED',
  REWARD_CLAIMABLE = 'REWARD_CLAIMABLE',
}

@Entity('notifications')
@Index(['userId', 'isRead'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Recipient. */
  @Column()
  userId: string;

  /** Usually a `NotificationType`. */
  @Column()
  type: string;

  @Column('text')
  message: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
