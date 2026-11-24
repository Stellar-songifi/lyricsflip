import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** Re-exported so callers may import the enum from the same place as the entity. */
export { NotificationType } from '../enums/notification-type.enum';

@Entity('notifications')
@Index(['userId', 'isRead'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Recipient user id. */
  @Column()
  userId: string;

  /** One of the well-known NotificationType values (stored as a plain varchar). */
  @Column()
  type: string;

  /** Short, human-readable heading shown in notification toasts and list items. */
  @Column()
  title: string;

  /** Full notification body. */
  @Column('text')
  message: string;

  /** Arbitrary JSON payload (roundId, position, tokenId, …). */
  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
