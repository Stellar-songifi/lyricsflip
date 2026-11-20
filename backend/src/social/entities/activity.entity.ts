import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Profile } from './profile.entity';

export type ActivityType =
  'round_joined' | 'round_completed' | 'friend_added' | 'reward_claimed';

@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: ['round_joined', 'round_completed', 'friend_added', 'reward_claimed'],
  })
  type: ActivityType;

  @Column('jsonb', { default: {} })
  metadata: Record<string, unknown>;

  @ManyToOne(() => Profile, (profile) => profile.activities)
  profile: Profile;
}
