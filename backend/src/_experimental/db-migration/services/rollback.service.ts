// src/db-migration/services/rollback.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection } from 'typeorm';
import { MigrationHistory } from '../entities/migration-history.entity';
import { Migration } from '../interfaces/migration.interface';
import { MigrationService } from './migration.service';
import { BackupService } from './backup.service';

@Injectable()
export class RollbackService {
  private readonly logger = new Logger(RollbackService.name);
  
  constructor(
    @InjectRepository(MigrationHistory)
    private migrationHistoryRepository: Repository<MigrationHistory>,
    private connection: Connection,
    private migrationService: MigrationService,
    private backupService: BackupService,
  ) {}

  /**
   * Rollback the last migration
   */
  async rollbackLastMigration(options: {
    transaction?: boolean;
    useBackup?: boolean;
  } = {}): Promise<MigrationHistory | null> {
    const lastMigration = await this.migrationHistoryRepository.findOne({
      where: { success: true, rolledBack: false },
      order: { appliedAt: 'DESC' },
    });
    
    if (!lastMigration) {
      this.logger.log('No migrations to rollback');
      return null;
    }
    
    return this.rollbackMigration(lastMigration.migrationId, options);
  }

  /**
   * Rollback a specific migration
   */
  async rollbackMigration(migrationId: string, options: {
    transaction?: boolean;
    useBackup?: boolean;
  } = {}): Promise<MigrationHistory | null> {
    const {
      transaction = true,
      useBackup = false,
    } = options;
    
    // Find migration history entry
    const migrationHistory = await this.migrationHistoryRepository.findOne({
      where: { migrationId, success: true, rolledBack: false },
    });
    
    if (!migrationHistory) {
      throw new Error(`Migration ${migrationId} has not been applied or has already been rolled back`);
    }
    
    // Try to use backup if specified
    if (useBackup && migrationHistory.backupId) {
      this.logger.log(`Rolling back migration ${migrationId} using backup ${migrationHistory.backupId}`);
      
      const restoreResult = await this.backupService.restoreBackup(migrationHistory.backupId);
      
      if (restoreResult) {
        // Mark as rolled back
        migrationHistory.rolledBack = true;
        migrationHistory.rolledBackAt = new Date();
        await this.migrationHistoryRepository.save(migrationHistory);
        
        this.logger.log(`Successfully rolled back migration ${migrationId} using backup`);
        return migrationHistory;
      } else {
        this.logger.warn(`Failed to restore backup ${migrationHistory.backupId}, will try manual rollback`);
      }
    }
    
    // Get migration definition
    const migrations = await this.migrationService['migrations'];
    const migration = migrations.get(migrationId);
    
    if (!migration) {
      throw new Error(`Migration definition for ${migrationId} not found`);
    }
    
    // Create query runner and start transaction if enabled
    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    
    if (transaction) {
      await queryRunner.startTransaction();
    }
    
    try {
      // Execute rollback
      await migration.down(queryRunner);
      
      // Commit transaction if enabled
      if (transaction) {
        await queryRunner.commitTransaction();
      }
      
      // Mark as rolled back
      migrationHistory.rolledBack = true;
      migrationHistory.rolledBackAt = new Date();
      await this.migrationHistoryRepository.save(migrationHistory);
      
      this.logger.log(`Successfully rolled back migration ${migrationId}`);
      return migrationHistory;
    } catch (error) {
      // Rollback transaction if enabled
      if (transaction) {
        await queryRunner.rollbackTransaction();
      }
      
      this.logger.error(
        `Failed to roll back migration ${migrationId}: ${error.message}`,
        error.stack
      );
      
      throw error;
    } finally {
      // Release query runner
      await queryRunner.release();
    }
  }

  /**
   * Rollback all migrations to a specific point
   */
  async rollbackToMigration(targetMigrationId: string, options: {
    transaction?: boolean;
    useBackup?: boolean;
  } = {}): Promise<MigrationHistory[]> {
    // Find all migrations applied after the target
    const migrations = await this.migrationHistoryRepository.find({
      where: { success: true, rolledBack: false },
      order: { appliedAt: 'DESC' },
    });
    
    // Find target index
    const targetIndex = migrations.findIndex(m => m.migrationId === targetMigrationId);
    
    if (targetIndex === -1) {
      throw new Error(`Target migration ${targetMigrationId} not found or not applied`);
    }
    
    // Get migrations to rollback (all after target)
    const migrationsToRollback = migrations.slice(0, targetIndex);
    
    if (migrationsToRollback.length === 0) {
      this.logger.log(`No migrations to rollback to ${targetMigrationId}`);
      return [];
    }
    
    this.logger.log(`Rolling back ${migrationsToRollback.length} migrations to ${targetMigrationId}`);
    
    const results: MigrationHistory[] = [];
    
    // Rollback each migration in reverse order
    for (const migration of migrationsToRollback) {
      try {
        const result = await this.rollbackMigration(migration.migrationId, options);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        this.logger.error(
          `Rollback process stopped due to error on migration ${migration.migrationId}: ${error.message}`
        );
        break;
      }
    }
    
    return results;
  }
}
