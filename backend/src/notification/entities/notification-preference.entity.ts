import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { NotificationType } from '../enums/notification-type.enum';

/**
 * Stores per-user, per-type opt-out preferences.
 *
 * A row is only created when the user explicitly changes a default.  Absent
 * rows mean "enabled".  The `channel` column distinguishes in-app vs email
 * so a user can disable email for REWARD_CLAIMABLE while keeping the in-app
 * badge, for example.
 *
 * Unique constraint: (userId, type, channel) — one row per user/type/channel
 * combination.
 */
export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
}

@Entity('notification_preferences')
@Index(['userId', 'type', 'channel'], { unique: true })
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  type: string;

  @Column({
    type: 'enum',
    enum: NotificationChannel,
    default: NotificationChannel.IN_APP,
  })
  channel: NotificationChannel;

  /** false = user has opted out of this type+channel combination. */
  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * Shape returned by GET /notifications/preferences:
 * keyed by NotificationType, then by channel.
 */
export type PreferenceMap = Partial<
  Record<NotificationType, Partial<Record<NotificationChannel, boolean>>>
>;
