// src/sync/entities/sync-history.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { SyncRecord } from './sync-record.entity';

@Entity('sync_history')
export class SyncHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @ManyToOne(() => SyncRecord, record => record.history)
  @JoinColumn({ name: 'syncRecordId' })
  syncRecord: SyncRecord;
  
  @Column()
  @Index()
  syncRecordId: string;
  
  @Column('int')
  version: number;
  
  @Column('jsonb')
  data: any;
  
  @Column({ nullable: true })
  deviceId: string;
  
  @Column({ nullable: true })
  strategyUsed: string;
  
  @Column('jsonb', { nullable: true })
  delta: any;
  
  @CreateDateColumn()
  createdAt: Date;
}