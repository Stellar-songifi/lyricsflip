// src/db-migration/commands/backup.commands.ts
import { Command, CommandRunner, Option } from 'nest-commander';
import { BackupService } from '../services/backup.service';

@Command({ name: 'backup:create', description: 'Create a database backup' })
export class BackupCreateCommand extends CommandRunner {
  constructor(private readonly backupService: BackupService) {
    super();
  }

  @Option({
    flags: '-p, --provider <provider>',
    description: 'Backup provider to use',
  })
  parseProvider(val: string): string {
    return val;
  }

  @Option({
    flags: '-r, --reason <reason>',
    description: 'Reason for the backup',
  })
  parseReason(val: string): string {
    return val;
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    try {
      console.log('Creating database backup...');
      
      const result = await this.backupService.createBackup({
        provider: options?.provider,
        reason: options?.reason || 'manual-cli',
      });
      
      if (result.success) {
        console.log(`Backup created successfully with ID: ${result.backupId}`);
        console.log(`Size: ${this.formatSize(result.size || 0)}`);
        console.log(`Location: ${result.location}`);
      } else {
        console.error(`Backup failed: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  }
  
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

@Command({ name: 'backup:restore', description: 'Restore a database from backup' })
export class BackupRestoreCommand extends CommandRunner {
  constructor(private readonly backupService: BackupService) {
    super();
  }

  @Option({
    flags: '-p, --provider <provider>',
    description: 'Backup provider to use',
  })
  parseProvider(val: string): string {
    return val;
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    try {
      if (passedParams.length === 0) {
        console.error('Error: Backup ID is required');
        process.exit(1);
      }
      
      const backupId = passedParams[0];
      
      console.log(`Restoring database from backup ${backupId}...`);
      
      const result = await this.backupService.restoreBackup(backupId, {
        provider: options?.provider,
      });
      
      if (result) {
        console.log(`Database successfully restored from backup ${backupId}`);
      } else {
        console.error(`Failed to restore database from backup ${backupId}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  }
}

@Command({ name: 'backup:list', description: 'List available backups' })
export class BackupListCommand extends CommandRunner {
  constructor(private readonly backupService: BackupService) {
    super();
  }

  @Option({
    flags: '-p, --provider <provider>',
    description: 'Filter by backup provider',
  })
  parseProvider(val: string): string {
    return val;
  }

  @Option({
    flags: '-m, --migration <migrationId>',
    description: 'Filter by migration ID',
  })
  parseMigrationId(val: string): string {
    return val;
  }

  @Option({
    flags: '-l, --limit <limit>',
    description: 'Limit number of results',
  })
  parseLimit(val: string): number {
    return parseInt(val, 10);
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    try {
      const backups = await this.backupService.listBackups({
        provider: options?.provider,
        migrationId: options?.migration,
        limit: options?.limit,
      });
      
      if (backups.length === 0) {
        console.log('No backups found');
        return;
      }
      
      console.log(`Found ${backups.length} backups:`);
      
      for (const backup of backups) {
        console.log(`- ID: ${backup.backupId}`);
        console.log(`  Timestamp: ${new Date(backup.timestamp).toISOString()}`);
        console.log(`  Size: ${this.formatSize(backup.size)}`);
        
        if (backup.migrationId) {
          console.log(`  Migration: ${backup.migrationId}`);
        }
        
        if (backup.metadata?.reason) {
          console.log(`  Reason: ${backup.metadata.reason}`);
        }
        
        console.log('');
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  }
  
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

@Command({ name: 'backup:delete', description: 'Delete a backup' })
export class BackupDeleteCommand extends CommandRunner {
  constructor(private readonly backupService: BackupService) {
    super();
  }

  @Option({
    flags: '-p, --provider <provider>',
    description: 'Backup provider to use',
  })
  parseProvider(val: string): string {
    return val;
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    try {
      if (passedParams.length === 0) {
        console.error('Error: Backup ID is required');
        process.exit(1);
      }
      
      const backupId = passedParams[0];
      
      console.log(`Deleting backup ${backupId}...`);
      
      const result = await this.backupService.deleteBackup(backupId, {
        provider: options?.provider,
      });
      
      if (result) {
        console.log(`Backup ${backupId} deleted successfully`);
      } else {
        console.error(`Failed to delete backup ${backupId}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  }
}