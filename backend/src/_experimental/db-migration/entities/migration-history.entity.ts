// src/db-migration/entities/migration-history.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('migration_history')
export class MigrationHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column()
  @Index()
  migrationId: string;
  
  @Column()
  name: string;
  
  @Column({ nullable: true })
  description?: string;
  
  @Column('json', { nullable: true })
  dependencies?: string[];
  
  @Column()
  @Index()
  appliedAt: Date;
  
  @Column({ default: true })
  success: boolean;
  
  @Column({ nullable: true })
  error?: string;
  
  @Column({ default: false })
  rolledBack: boolean;
  
  @Column({ nullable: true })
  rolledBackAt?: Date;
  
  @Column({ nullable: true })
  backupId?: string;
  
  @Column('json', { nullable: true })
  metadata?: any;
  
  @CreateDateColumn()
  createdAt: Date;
  
  @UpdateDateColumn()
  updatedAt: Date;
}
