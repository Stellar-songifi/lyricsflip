// src/achievement/entities/user-achievement.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import { Achievement } from './achievement.entity';
import { User } from '../../user/user.entity';

@Entity()
export class UserAchievement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @ManyToOne(() => Achievement)
  achievement: Achievement;

  @Column('float')
  progress: number;

  @Column({ default: false })
  isCompleted: boolean;

  @CreateDateColumn()
  unlockedAt: Date;
}