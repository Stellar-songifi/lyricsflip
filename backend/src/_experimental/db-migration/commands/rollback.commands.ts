// src/db-migration/commands/rollback.commands.ts
import { Command, CommandRunner, Option } from 'nest-commander';
import { RollbackService } from '../services/rollback.service';

@Command({ name: 'migration:rollback', description: 'Rollback last migration' })
export class MigrationRollbackCommand extends CommandRunner {
  constructor(private readonly rollbackService: RollbackService) {
    super();
  }

  @Option({
    flags: '-b, --use-backup',
    description: 'Use backup for rollback if available',
  })
  parseUseBackup(val: string): boolean {
    return true;
  }

  @Option({
    flags: '-t, --skip-transaction',
    description: 'Skip transaction wrapping',
  })
  parseSkipTransaction(val: string): boolean {
    return true;
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    try {
      console.log('Rolling back last migration...');
      
      const result = await this.rollbackService.rollbackLastMigration({
        useBackup: options?.useBackup,
        transaction: !options?.skipTransaction,
      });
      
      if (result) {
        console.log(`Successfully rolled back migration ${result.migrationId} (${result.name})`);
      } else {
        console.log('No migrations to roll back');
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  }
}

@Command({ name: 'migration:rollback-to', description: 'Rollback to a specific migration' })
export class MigrationRollbackToCommand extends CommandRunner {
  constructor(private readonly rollbackService: RollbackService) {
    super();
  }

  @Option({
    flags: '-b, --use-backup',
    description: 'Use backup for rollback if available',
  })
  parseUseBackup(val: string): boolean {
    return true;
  }

  @Option({
    flags: '-t, --skip-transaction',
    description: 'Skip transaction wrapping',
  })
  parseSkipTransaction(val: string): boolean {
    return true;
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    try {
      if (passedParams.length === 0) {
        console.error('Error: Target migration ID is required');
        process.exit(1);
      }
      
      const targetMigrationId = passedParams[0];
      
      console.log(`Rolling back to migration ${targetMigrationId}...`);
      
      const results = await this.rollbackService.rollbackToMigration(
        targetMigrationId,
        {
          useBackup: options?.useBackup,
          transaction: !options?.skipTransaction,
        }
      );
      
      if (results.length === 0) {
        console.log(`No migrations to roll back to ${targetMigrationId}`);
      } else {
        console.log(`Successfully rolled back ${results.length} migrations to ${targetMigrationId}`);
        
        console.log('\nRolled back migrations:');
        for (const result of results) {
          console.log(`- ${result.migrationId} (${result.name})`);
        }
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  }
}