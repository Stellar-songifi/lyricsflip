import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('processed_events')
export class ProcessedEvent {
  @PrimaryColumn()
  id: string;

  @Column()
  txHash: string;

  @Column()
  eventType: string;

  @Column({ nullable: true })
  ledger: number;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown>;

  @CreateDateColumn()
  processedAt: Date;
}
