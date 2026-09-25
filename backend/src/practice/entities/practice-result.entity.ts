// src/practice/entities/practice-result.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from '../../user/user.entity';
import { PracticeSession } from './practice-session.entity';
import { PracticeItem } from './practice-item.entity';

@Entity()
export class PracticeResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @ManyToOne(() => PracticeSession, session => session.results)
  session: PracticeSession;

  @ManyToOne(() => PracticeItem)
  practiceItem: PracticeItem;

  @Column({ default: 0 })
  score: number;

  @Column({ default: 0 })
  timeSpentSeconds: number;

  @Column({ type: 'simple-json', nullable: true })
  userResponse: Record<string, any>;

  @Column({ type: 'simple-json', nullable: true })
  feedback: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
