import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('game_results')
export class GameResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column()
  gameId: string;

  @Column('json')
  gameData: any;

  @Column('int')
  score: number;

  @Column('int')
  timeSpent: number;

  @Column('int', { default: 0 })
  totalPoints: number;

  @Column('int', { default: 0 })
  correctAnswers: number;

  @Column('int', { default: 0 })
  totalAnswers: number;

  @Column('int', { default: 0 })
  bestRoundScore: number;

  @Column('json', { nullable: true })
  achievements: any[];

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}