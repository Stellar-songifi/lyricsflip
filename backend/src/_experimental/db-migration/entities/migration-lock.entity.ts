// src/db-migration/entities/migration-lock.entity.ts
import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('migration_lock')
export class MigrationLock {
  @PrimaryColumn()
  id: string;
  
  @Column()
  lockedBy: string;
  
  @Column()
  lockedAt: Date;
  
  @Column({ nullable: true })
  expiresAt?: Date;
  
  @Column({ default: false })
  isExecuting: boolean;
  
  @Column({ nullable: true })
  currentMigrationId?: string;
  
  @UpdateDateColumn()
  updatedAt: Date;
}
