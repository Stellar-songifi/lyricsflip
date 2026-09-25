// src/db-migration/services/migration.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MigrationHistory } from '../entities/migration-history.entity';
import { MigrationLock } from '../entities/migration-lock.entity';
import { Migration } from '../interfaces/migration.interface';
import { BackupService } from './backup.service';
import { ValidatorService } from './validator.service';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);
  private readonly migrations: Map<string, Migration> = new Map();
  private readonly lockId = 'migration_lock';
  private readonly maxLockTime = 30 * 60 * 1000; // 30 minutes

  constructor(
    @InjectRepository(MigrationHistory)
    private migrationHistoryRepository: Repository<MigrationHistory>,
    @InjectRepository(MigrationLock)
    private migrationLockRepository: Repository<MigrationLock>,
    private connection: Connection,
    private backupService: BackupService,
    private validatorService: ValidatorService,
  ) {}

  /**
   * Initialize the migration service
   */
  async init(migrationDir: string): Promise<void> {
    try {
      // Load all migrations from the specified directory
      await this.loadMigrations(migrationDir);
      
      // Initialize migration lock
      await this.initMigrationLock();
      
      this.logger.log(`Migration service initialized with ${this.migrations.size} migrations`);
    } catch (error) {
      this.logger.error(`Failed to initialize migration service: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Load migrations from the specified directory
   */
  private async loadMigrations(migrationDir: string): Promise<void> {
    const migrationFiles = await fs.promises.readdir(migrationDir);
    
    for (const file of migrationFiles) {
      if (file.endsWith('.js') || file.endsWith('.ts')) {
        try {
          const migrationModule = await import(path.join(migrationDir, file));
          const migration: Migration = migrationModule.default;
          
          if (this.isValidMigration(migration)) {
            this.migrations.set(migration.id, migration);
            this.logger.verbose(`Loaded migration: ${migration.name} (${migration.id})`);
          } else {
            this.logger.warn(`Invalid migration in file: ${file}`);
          }
        } catch (error) {
          this.logger.error(`Failed to load migration file ${file}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Check if a migration object is valid
   */
  private isValidMigration(migration: any): boolean {
    return (
      migration &&
      typeof migration.id === 'string' &&
      typeof migration.name === 'string' &&
      typeof migration.timestamp === 'number' &&
      typeof migration.up === 'function' &&
      typeof migration.down === 'function'
    );
  }

  /**
   * Initialize migration lock
   */
  private async initMigrationLock(): Promise<void> {
    const existingLock = await this.migrationLockRepository.findOne(this.lockId);
    
    if (!existingLock) {
      await this.migrationLockRepository.save({
        id: this.lockId,
        lockedBy: 'none',
        lockedAt: new Date(0),
        isExecuting: false,
      });
    }
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations(): Promise<Migration[]> {
    const appliedMigrations = await this.migrationHistoryRepository.find({
      where: { success: true, rolledBack: false },
      select: ['migrationId'],
    });
    
    const appliedIds = new Set(appliedMigrations.map(m => m.migrationId));
    
    return Array.from(this.migrations.values())
      .filter(migration => !appliedIds.has(migration.id))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get applied migrations
   */
  async getAppliedMigrations(): Promise<MigrationHistory[]> {
    return this.migrationHistoryRepository.find({
      where: { success: true, rolledBack: false },
      order: { appliedAt: 'DESC' },
    });
  }

  /**
   * Apply pending migrations
   */
  async applyPendingMigrations(options: {
    createBackup?: boolean;
    validate?: boolean;
    transaction?: boolean;
  } = {}): Promise<MigrationHistory[]> {
    const {
      createBackup = true,
      validate = true,
      transaction = true,
    } = options;
    
    // Acquire lock
    const lock = await this.acquireLock();
    if (!lock) {
      throw new Error('Failed to acquire migration lock. Another migration might be in progress.');
    }
    
    try {
      const pendingMigrations = await this.getPendingMigrations();
      
      if (pendingMigrations.length === 0) {
        this.logger.log('No pending migrations to apply');
        return [];
      }
      
      this.logger.log(`Applying ${pendingMigrations.length} pending migrations`);
      
      const results: MigrationHistory[] = [];
      
      for (const migration of pendingMigrations) {
        let backupId: string | undefined;
        
        try {
          // Update lock with current migration
          await this.updateLock(migration.id);
          
          // Create backup if enabled
          if (createBackup) {
            const backupResult = await this.backupService.createBackup({
              reason: 'pre-migration',
              migrationId: migration.id,
              metadata: {
                migrationName: migration.name,
                timestamp: new Date().toISOString(),
              },
            });
            
            if (backupResult.success) {
              backupId = backupResult.backupId;
              this.logger.log(`Created backup ${backupId} before migration ${migration.id}`);
            } else {
              throw new Error(`Failed to create backup: ${backupResult.error}`);
            }
          }
          
          // Create query runner and start transaction if enabled
          const queryRunner = this.connection.createQueryRunner();
          await queryRunner.connect();
          
          if (transaction) {
            await queryRunner.startTransaction();
          }
          
          try {
            // Run pre-validation if enabled and defined
            if (validate && migration.validateBefore) {
              const validationResult = await migration.validateBefore(queryRunner);
              if (!validationResult) {
                throw new Error(`Pre-migration validation failed for migration ${migration.id}`);
              }
            }
            
            // Apply migration
            await migration.up(queryRunner);
            
            // Run post-validation if enabled and defined
            if (validate && migration.validateAfter) {
              const validationResult = await migration.validateAfter(queryRunner);
              if (!validationResult) {
                throw new Error(`Post-migration validation failed for migration ${migration.id}`);
              }
            }
            
            // Commit transaction if enabled
            if (transaction) {
              await queryRunner.commitTransaction();
            }
            
            // Record successful migration
            const historyEntry = await this.recordMigration(migration, true, undefined, backupId);
            results.push(historyEntry);
            
            this.logger.log(`Successfully applied migration: ${migration.name} (${migration.id})`);
          } catch (error) {
            // Rollback transaction if enabled
            if (transaction) {
              await queryRunner.rollbackTransaction();
            }
            
            // Record failed migration
            const historyEntry = await this.recordMigration(
              migration, 
              false, 
              error.message, 
              backupId
            );
            results.push(historyEntry);
            
            this.logger.error(
              `Failed to apply migration ${migration.id}: ${error.message}`,
              error.stack
            );
            
            // Stop processing further migrations
            break;
          } finally {
            // Release query runner
            await queryRunner.release();
          }
        } catch (error) {
          this.logger.error(
            `Error while handling migration ${migration.id}: ${error.message}`,
            error.stack
          );
          break;
        }
      }
      
      return results;
    } finally {
      // Release lock
      await this.releaseLock();
    }
  }

  /**
   * Apply a specific migration
   */
  async applyMigration(migrationId: string, options: {
    createBackup?: boolean;
    validate?: boolean;
    transaction?: boolean;
  } = {}): Promise<MigrationHistory> {
    const migration = this.migrations.get(migrationId);
    
    if (!migration) {
      throw new Error(`Migration with ID ${migrationId} not found`);
    }
    
    // Check if migration has already been applied
    const existingMigration = await this.migrationHistoryRepository.findOne({
      where: { migrationId, success: true, rolledBack: false },
    });
    
    if (existingMigration) {
      throw new Error(`Migration ${migrationId} has already been applied`);
    }
    
    // Acquire lock
    const lock = await this.acquireLock();
    if (!lock) {
      throw new Error('Failed to acquire migration lock. Another migration might be in progress.');
    }
    
    try {
      // Update lock with current migration
      await this.updateLock(migration.id);
      
      let backupId: string | undefined;
      
      // Create backup if enabled
      if (options.createBackup !== false) {
        const backupResult = await this.backupService.createBackup({
          reason: 'pre-migration',
          migrationId: migration.id,
          metadata: {
            migrationName: migration.name,
            timestamp: new Date().toISOString(),
          },
        });
        
        if (backupResult.success) {
          backupId = backupResult.backupId;
          this.logger.log(`Created backup ${backupId} before migration ${migration.id}`);
        } else {
          throw new Error(`Failed to create backup: ${backupResult.error}`);
        }
      }
      
      // Create query runner and start transaction if enabled
      const queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      
      if (options.transaction !== false) {
        await queryRunner.startTransaction();
      }
      
      try {
        // Run pre-validation if enabled and defined
        if (options.validate !== false && migration.validateBefore) {
          const validationResult = await migration.validateBefore(queryRunner);
          if (!validationResult) {
            throw new Error(`Pre-migration validation failed for migration ${migration.id}`);
          }
        }
        
        // Apply migration
        await migration.up(queryRunner);
        
        // Run post-validation if enabled and defined
        if (options.validate !== false && migration.validateAfter) {
          const validationResult = await migration.validateAfter(queryRunner);
          if (!validationResult) {
            throw new Error(`Post-migration validation failed for migration ${migration.id}`);
          }
        }
        
        // Commit transaction if enabled
        if (options.transaction !== false) {
          await queryRunner.commitTransaction();
        }
        
        // Record successful migration
        const historyEntry = await this.recordMigration(migration, true, undefined, backupId);
        
        this.logger.log(`Successfully applied migration: ${migration.name} (${migration.id})`);
        
        return historyEntry;
      } catch (error) {
        // Rollback transaction if enabled
        if (options.transaction !== false) {
          await queryRunner.rollbackTransaction();
        }
        
        // Record failed migration
        const historyEntry = await this.recordMigration(
          migration, 
          false, 
          error.message, 
          backupId
        );
        
        this.logger.error(
          `Failed to apply migration ${migration.id}: ${error.message}`,
          error.stack
        );
        
        return historyEntry;
      } finally {
        // Release query runner
        await queryRunner.release();
      }
    } finally {
      // Release lock
      await this.releaseLock();
    }
  }

  /**
   * Record migration in history
   */
  private async recordMigration(
    migration: Migration,
    success: boolean,
    error?: string,
    backupId?: string,
  ): Promise<MigrationHistory> {
    const historyEntry = this.migrationHistoryRepository.create({
      migrationId: migration.id,
      name: migration.name,
      description: migration.description,
      dependencies: migration.dependencies,
      appliedAt: new Date(),
      success,
      error,
      backupId,
      metadata: {
        timestamp: migration.timestamp,
      },
    });
    
    return this.migrationHistoryRepository.save(historyEntry);
  }

  /**
   * Acquire migration lock
   */
  private async acquireLock(): Promise<boolean> {
    const now = new Date();
    const instanceId = uuidv4();
    
    // Try to acquire lock or take it if expired
    const result = await this.migrationLockRepository.createQueryBuilder()
      .update(MigrationLock)
      .set({
        lockedBy: instanceId,
        lockedAt: now,
        expiresAt: new Date(now.getTime() + this.maxLockTime),
        isExecuting: true,
      })
      .where('id = :lockId', { lockId: this.lockId })
      .andWhere('(lockedBy = :none OR expiresAt < :now)', { none: 'none', now })
      .execute();
    
    return result.affected > 0;
  }

  /**
   * Update lock with current migration ID
   */
  private async updateLock(migrationId: string): Promise<void> {
    await this.migrationLockRepository.update(
      { id: this.lockId },
      { currentMigrationId: migrationId }
    );
  }

  /**
   * Release migration lock
   */
  private async releaseLock(): Promise<void> {
    await this.migrationLockRepository.update(
      { id: this.lockId },
      {
        isExecuting: false,
        currentMigrationId: null,
        lockedBy: 'none',
      }
    );
  }
}
