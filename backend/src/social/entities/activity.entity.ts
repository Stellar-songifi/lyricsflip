import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Profile } from './profile.entity';

export enum ActivityType {
  GAME_PLAYED = 'game_played',
  ACHIEVEMENT_EARNED = 'achievement_earned',
  FRIEND_ADDED = 'friend_added',
  CHALLENGE_SENT = 'challenge_sent',
  CHALLENGE_ACCEPTED = 'challenge_accepted',
}

@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: ActivityType })
  type: ActivityType;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown>;

  @ManyToOne(() => Profile, (profile) => profile.activities, { nullable: true })
  @JoinColumn({ name: 'userId' })
  profile: Profile;

  @CreateDateColumn()
  createdAt: Date;
}
