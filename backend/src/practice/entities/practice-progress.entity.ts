// src/practice/entities/practice-progress.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../user/user.entity';
import { Genre } from '../../songs/enums/genre.enum';

@Entity('practice_progress')
export class PracticeProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @Column({ type: 'enum', enum: Genre })
  genre: Genre;

  @Column({ default: 0 })
  totalSessions: number;

  @Column({ default: 0 })
  totalItems: number;

  @Column({ default: 0 })
  correctAnswers: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  averageScore: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  averageTimePerItem: number;

  @Column({ default: 0 })
  masteredItems: number;

  @Column({ type: 'simple-json', default: '{}' })
  strengthsBySubcategory: Record<string, number>;

  @Column({ type: 'simple-json', default: '{}' })
  weaknessesBySubcategory: Record<string, number>;

  @Column({ type: 'simple-json', default: '[]' })
  learningPath: string[];

  @UpdateDateColumn()
  updatedAt: Date;
}
