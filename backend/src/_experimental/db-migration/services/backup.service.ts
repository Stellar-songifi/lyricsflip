// src/db-migration/services/backup.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection } from 'typeorm';
import { BackupMetadata } from '../entities/backup-metadata.entity';
import { BackupProvider, BackupResult, BackupInfo } from '../interfaces/backup.interface';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';

const execPromise = promisify(exec);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly providers: Map<string, BackupProvider> = new Map();
  private defaultProvider: string | null = null;
  private backupDir: string = './backups';

  constructor(
    @InjectRepository(BackupMetadata)
    private backupMetadataRepository: Repository<BackupMetadata>,
    private connection: Connection,
  ) {
    // Register built-in filesystem backup provider
    this.registerProvider(new FilesystemBackupProvider(this.backupDir));
    this.setDefaultProvider('filesystem');
  }

  /**
   * Set the backup directory
   */
  setBackupDirectory(dir: string): void {
    this.backupDir = dir;
    // Update filesystem provider
    const provider = this.providers.get('filesystem');
    if (provider && provider instanceof FilesystemBackupProvider) {
      provider.setBackupDirectory(dir);
    }
  }

  /**
   * Register a backup provider
   */
  registerProvider(provider: BackupProvider): void {
    this.providers.set(provider.name, provider);
    this.logger.log(`Registered backup provider: ${provider.name}`);
    
    // Set as default if no default provider
    if (!this.defaultProvider) {
      this.defaultProvider = provider.name;
    }
  }

  /**
   * Set the default backup provider
   */
  setDefaultProvider(providerName: string): void {
    if (!this.providers.has(providerName)) {
      throw new Error(`Backup provider ${providerName} not registered`);
    }
    
    this.defaultProvider = providerName;
    this.logger.log(`Set default backup provider to ${providerName}`);
  }

  /**
   * Get a provider by name
   */
  getProvider(name?: string): BackupProvider {
    const providerName = name || this.defaultProvider;
    
    if (!providerName) {
      throw new Error('No backup provider specified and no default provider set');
    }
    
    const provider = this.providers.get(providerName);
    
    if (!provider) {
      throw new Error(`Backup provider ${providerName} not found`);
    }
    
    return provider;
  }

  /**
   * Create a database backup
   */
  async createBackup(options: {
    reason?: string;
    migrationId?: string;
    provider?: string;
    metadata?: any;
  } = {}): Promise<BackupResult> {
    try {
      const provider = this.getProvider(options.provider);
      
      // Get connection options
      const connectionOptions = this.connection.options;
      
      // Create backup
      const result = await provider.createBackup(connectionOptions, {
        reason: options.reason || 'manual',
        migrationId: options.migrationId,
        timestamp: new Date().toISOString(),
        ...options.metadata,
      });
      
      if (result.success) {
        // Save backup metadata
        await this.backupMetadataRepository.save({
          backupId: result.backupId,
          filename: path.basename(result.location || ''),
          location: result.location || '',
          size: result.size || 0,
          migrationId: options.migrationId,
          metadata: {
            reason: options.reason || 'manual',
            provider: provider.name,
            timestamp: new Date().toISOString(),
            ...options.metadata,
          },
        });
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Error creating backup: ${error.message}`, error.stack);
      
      return {
        backupId: uuidv4(),
        success: false,
        timestamp: Date.now(),
        error: error.message,
      };
    }
  }

  /**
   * Restore a database from backup
   */
  async restoreBackup(backupId: string, options: {
    provider?: string;
  } = {}): Promise<boolean> {
    try {
      // Get backup metadata
      const backupMetadata = await this.backupMetadataRepository.findOne({
        where: { backupId },
      });
      
      if (!backupMetadata) {
        throw new Error(`Backup with ID ${backupId} not found`);
      }
      
      // Get provider (use the one that created the backup or specified provider)
      const providerName = options.provider || 
        (backupMetadata.metadata?.provider || this.defaultProvider);
      
      const provider = this.getProvider(providerName);
      
      // Get connection options
      const connectionOptions = this.connection.options;
      
      // Restore backup
      const result = await provider.restoreBackup(backupId, connectionOptions);
      
      if (result) {
        this.logger.log(`Successfully restored backup ${backupId}`);
      } else {
        this.logger.error(`Failed to restore backup ${backupId}`);
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Error restoring backup: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * List available backups
   */
  async listBackups(options: {
    migrationId?: string;
    provider?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<BackupInfo[]> {
    try {
      const query = this.backupMetadataRepository.createQueryBuilder('backup')
        .where('backup.available = :available', { available: true });
      
      if (options.migrationId) {
        query.andWhere('backup.migrationId = :migrationId', { 
          migrationId: options.migrationId 
        });
      }
      
      if (options.provider) {
        query.andWhere("backup.metadata->>'provider' = :provider", { 
          provider: options.provider 
        });
      }
      
      if (options.limit) {
        query.limit(options.limit);
      }
      
      if (options.offset) {
        query.offset(options.offset);
      }
      
      query.orderBy('backup.createdAt', 'DESC');
      
      const backups = await query.getMany();
      
      return backups.map(backup => ({
        backupId: backup.backupId,
        timestamp: backup.createdAt.getTime(),
        size: backup.size,
        migrationId: backup.migrationId,
        metadata: backup.metadata,
      }));
    } catch (error) {
      this.logger.error(`Error listing backups: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId: string, options: {
    provider?: string;
  } = {}): Promise<boolean> {
    try {
      // Get backup metadata
      const backupMetadata = await this.backupMetadataRepository.findOne({
        where: { backupId },
      });
      
      if (!backupMetadata) {
        throw new Error(`Backup with ID ${backupId} not found`);
      }
      
      // Get provider (use the one that created the backup or specified provider)
      const providerName = options.provider || 
        (backupMetadata.metadata?.provider || this.defaultProvider);
      
      const provider = this.getProvider(providerName);
      
      // Delete backup
      const result = await provider.deleteBackup(backupId);
      
      if (result) {
        // Update backup metadata
        backupMetadata.available = false;
        await this.backupMetadataRepository.save(backupMetadata);
        
        this.logger.log(`Successfully deleted backup ${backupId}`);
      } else {
        this.logger.error(`Failed to delete backup ${backupId}`);
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Error deleting backup: ${error.message}`, error.stack);
      return false;
    }
  }
}

/**
 * Filesystem backup provider implementation
 */
class FilesystemBackupProvider implements BackupProvider {
  name = 'filesystem';
  private backupDir: string;
  
  constructor(backupDir: string) {
    this.backupDir = backupDir;
    this.ensureBackupDirectory();
  }
  
  setBackupDirectory(dir: string): void {
    this.backupDir = dir;
    this.ensureBackupDirectory();
  }
  
  private ensureBackupDirectory(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }
  
  async createBackup(connectionOptions: any, metadata: any): Promise<BackupResult> {
    try {
      // Generate backup ID and filename
      const backupId = uuidv4();
      const timestamp = new Date().toISOString().replace(/[:\.]/g, '-');
      const filename = `backup-${timestamp}-${backupId}.sql`;
      const backupPath = path.join(this.backupDir, filename);
      
      // Determine database type and run appropriate backup command
      let command: string;
      
      switch (connectionOptions.type) {
        case 'postgres':
          command = this.buildPostgresBackupCommand(connectionOptions, backupPath);
          break;
        case 'mysql':
        case 'mariadb':
          command = this.buildMysqlBackupCommand(connectionOptions, backupPath);
          break;
        default:
          throw new Error(`Unsupported database type: ${connectionOptions.type}`);
      }
      
      // Execute backup command
      await execPromise(command);
      
      // Get backup file size
      const stats = fs.statSync(backupPath);
      
      return {
        backupId,
        success: true,
        timestamp: Date.now(),
        size: stats.size,
        location: backupPath,
      };
    } catch (error) {
      return {
        backupId: uuidv4(),
        success: false,
        timestamp: Date.now(),
        error: error.message,
      };
    }
  }
  
  async restoreBackup(backupId: string, connectionOptions: any): Promise<boolean> {
    try {
      // Find backup file by ID
      const files = await fs.promises.readdir(this.backupDir);
      const backupFile = files.find(f => f.includes(backupId));
      
      if (!backupFile) {
        throw new Error(`Backup file for ID ${backupId} not found`);
      }
      
      const backupPath = path.join(this.backupDir, backupFile);
      
      // Determine database type and run appropriate restore command
      let command: string;
      
      switch (connectionOptions.type) {
        case 'postgres':
          command = this.buildPostgresRestoreCommand(connectionOptions, backupPath);
          break;
        case 'mysql':
        case 'mariadb':
          command = this.buildMysqlRestoreCommand(connectionOptions, backupPath);
          break;
        default:
          throw new Error(`Unsupported database type: ${connectionOptions.type}`);
      }
      
      // Execute restore command
      await execPromise(command);
      
      return true;
    } catch (error) {
      console.error('Restore error:', error);
      return false;
    }
  }
  
  async listBackups(filter?: any): Promise<BackupInfo[]> {
    try {
      const files = await fs.promises.readdir(this.backupDir);
      const backupInfos: BackupInfo[] = [];
      
      for (const file of files) {
        if (file.startsWith('backup-') && file.endsWith('.sql')) {
          const backupIdMatch = file.match(/backup-.*-([\w-]+)\.sql$/);
          const backupId = backupIdMatch ? backupIdMatch[1] : file;
          
          const stats = fs.statSync(path.join(this.backupDir, file));
          
          backupInfos.push({
            backupId,
            timestamp: stats.mtime.getTime(),
            size: stats.size,
          });
        }
      }
      
      return backupInfos;
    } catch (error) {
      console.error('List backups error:', error);
      return [];
    }
  }
  
  async deleteBackup(backupId: string): Promise<boolean> {
    try {
      // Find backup file by ID
      const files = await fs.promises.readdir(this.backupDir);
      const backupFile = files.find(f => f.includes(backupId));
      
      if (!backupFile) {
        throw new Error(`Backup file for ID ${backupId} not found`);
      }
      
      const backupPath = path.join(this.backupDir, backupFile);
      
      // Delete file
      await fs.promises.unlink(backupPath);
      
      return true;
    } catch (error) {
      console.error('Delete backup error:', error);
      return false;
    }
  }
  
  private buildPostgresBackupCommand(connectionOptions: any, backupPath: string): string {
    const {
      host = 'localhost',
      port = 5432,
      username,
      password,
      database,
    } = connectionOptions;
    
    // Build pg_dump command
    let command = `PGPASSWORD='${password}' pg_dump`;
    command += ` -h ${host}`;
    command += ` -p ${port}`;
    command += ` -U ${username}`;
    command += ` -F p`; // Plain text format
    command += ` -f "${backupPath}"`;
    command += ` ${database}`;
    
    return command;
  }
  
  private buildPostgresRestoreCommand(connectionOptions: any, backupPath: string): string {
    const {
      host = 'localhost',
      port = 5432,
      username,
      password,
      database,
    } = connectionOptions;
    
    // Build psql command
    let command = `PGPASSWORD='${password}' psql`;
    command += ` -h ${host}`;
    command += ` -p ${port}`;
    command += ` -U ${username}`;
    command += ` -d ${database}`;
    command += ` -f "${backupPath}"`;
    
    return command;
  }
  
  private buildMysqlBackupCommand(connectionOptions: any, backupPath: string): string {
    const {
      host = 'localhost',
      port = 3306,
      username,
      password,
      database,
    } = connectionOptions;
    
    // Build mysqldump command
    let command = `mysqldump`;
    command += ` -h${host}`;
    command += ` -P${port}`;
    command += ` -u${username}`;
    command += ` -p${password}`;
    command += ` --result-file="${backupPath}"`;
    command += ` ${database}`;
    
    return command;
  }
  
  private buildMysqlRestoreCommand(connectionOptions: any, backupPath: string): string {
    const {
      host = 'localhost',
      port = 3306,
      username,
      password,
      database,
    } = connectionOptions;
    
    // Build mysql command
    let command = `mysql`;
    command += ` -h${host}`;
    command += ` -P${port}`;
    command += ` -u${username}`;
    command += ` -p${password}`;
    command += ` ${database}`;
    command += ` < "${backupPath}"`;
    
    return command;
  }
}