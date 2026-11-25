import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('chain_rounds')
export class ChainRound {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  contractAddress: string;

  @Column({ nullable: true })
  roundId: number;

  @Column({ nullable: true })
  roundIndex: number;

  @Column({ nullable: true })
  status: string;

  @Column({ nullable: true })
  startTime: Date;

  @Column({ nullable: true })
  endTime: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
