import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('chain_round_results')
export class ChainRoundResult {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  roundId: number;

  @Column({ nullable: true })
  winner: string;

  @Column({ nullable: true })
  totalPlayers: number;

  @Column({ type: 'jsonb', nullable: true })
  rankings: Record<string, unknown>[];

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
