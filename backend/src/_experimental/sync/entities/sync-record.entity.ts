// src/sync/entities/sync-record.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, OneToMany } from 'typeorm';
import { SyncHistory } from './sync-history.entity';

@Entity('sync_records')
export class SyncRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column()
  @Index()
  userId: string;
  
  @Column()
  @Index()
  dataType: string;
  
  @Column('int')
  version: number;
  
  @Column('jsonb')
  data: any;
  
  @Column('timestamp')
  lastSyncedAt: Date;
  
  @CreateDateColumn()
  createdAt: Date;
  
  @UpdateDateColumn()
  updatedAt: Date;
  
  @OneToMany(() => SyncHistory, history => history.syncRecord)
  history: SyncHistory[];
}