import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('chain_round_players')
export class ChainRoundPlayer {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  roundId: number;

  @Column({ nullable: true })
  player: string;

  @Column({ nullable: true })
  score: number;

  @Column({ nullable: true })
  rank: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
