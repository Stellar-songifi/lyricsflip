// entities/profile.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Friend } from './friend.entity';
import { Activity } from './activity.entity';

export interface UserStats {
  totalGames: number;
  gamesWon: number;
  currentStreak: number;
  bestStreak: number;
  totalXp: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlockedAt: Date;
}

@Entity()
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  username: string;

  @Column()
  displayName: string;

  @Column()
  avatar: string;

  @Column('text')
  bio: string;

  @Column('json')
  stats: UserStats;

  @Column('json')
  achievements: Achievement[];

  @Column()
  lastActive: Date;

  @OneToMany(() => Friend, (friend) => friend.profile)
  friends: Friend[];

  @OneToMany(() => Activity, (activity) => activity.profile)
  activities: Activity[];
}
