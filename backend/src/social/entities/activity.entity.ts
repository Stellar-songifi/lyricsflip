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
  ACHIEVEMENT_UNLOCKED = 'achievement_unlocked',
  FRIEND_ADDED = 'friend_added',
  CHALLENGE_CREATED = 'challenge_created',
  CHALLENGE_COMPLETED = 'challenge_completed',
  WAGER_PLACED = 'wager_placed',
  LEVEL_UP = 'level_up',
}

@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: ActivityType,
  })
  type: ActivityType;

  @Column('json', { nullable: true })
  data: any;

  @ManyToOne(() => Profile, (profile) => profile.activities, { nullable: true })
  @JoinColumn({ name: 'userId', referencedColumnName: 'id' })
  profile: Profile;

  @CreateDateColumn()
  createdAt: Date;
}
