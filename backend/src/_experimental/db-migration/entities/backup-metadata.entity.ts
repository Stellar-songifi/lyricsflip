// src/db-migration/entities/backup-metadata.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('backup_metadata')
export class BackupMetadata {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column()
  @Index()
  backupId: string;
  
  @Column()
  filename: string;
  
  @Column()
  location: string;
  
  @Column('bigint')
  size: number;
  
  @Column({ nullable: true })
  @Index()
  migrationId?: string;
  
  @Column({ default: true })
  available: boolean;
  
  @Column('json', { nullable: true })
  metadata?: any;
  
  @CreateDateColumn()
  @Index()
  createdAt: Date;
}