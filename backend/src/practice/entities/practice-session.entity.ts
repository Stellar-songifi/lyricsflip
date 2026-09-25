// src/practice/entities/practice-session.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../user/user.entity';
import { PracticeResult } from './practice-result.entity';
import { Difficulty } from '../enums/difficulty.enum';
import { Genre } from '../../songs/enums/genre.enum';

@Entity()
export class PracticeSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @Column({ type: 'enum', enum: Difficulty, default: Difficulty.MEDIUM })
  difficulty: Difficulty;

  // Null means a mixed-genre session.
  @Column({ type: 'enum', enum: Genre, nullable: true })
  genre: Genre | null;

  @Column({ default: 0 })
  durationMinutes: number;

  @Column({ default: false })
  isCompleted: boolean;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @OneToMany(() => PracticeResult, result => result.session)
  results: PracticeResult[];
}
