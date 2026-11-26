import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('chain_answers')
export class ChainAnswer {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  roundId: number;

  @Column({ nullable: true })
  player: string;

  @Column({ nullable: true })
  answer: string;

  @Column({ nullable: true })
  isCorrect: boolean;

  @Column({ nullable: true })
  correct: boolean;

  @Column({ nullable: true })
  points: number;

  @Column({ nullable: true })
  cardIndex: number;

  @Column({ nullable: true })
  ledger: number;

  @Column({ nullable: true })
  txHash: string;

  @Column({ nullable: true })
  answeredAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
