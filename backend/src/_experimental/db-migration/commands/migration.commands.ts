// src/db-migration/commands/migration.commands.ts
import { Command, CommandRunner, Option } from 'nest-commander';
import { MigrationService } from '../services/migration.service';
import { TestingService } from '../services/testing.service';

@Command({ name: 'migration:status', description: 'Show migration status' })
export class MigrationStatusCommand extends CommandRunner {
  constructor(private readonly migrationService: MigrationService) {
    super();
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    try {
      const pendingMigrations = await this.migrationService.getPendingMigrations();
      const appliedMigrations = await this.migrationService.getAppliedMigrations();
      
      console.log(`\nMigration Status:`);
      console.log(`- Pending migrations: ${pendingMigrations.length}`);
      console.log(`- Applied migrations: ${appliedMigrations.length}`);
      
      if (pendingMigrations.length > 0) {
        console.log(`\nPending Migrations:`);
        for (const migration of pendingMigrations) {
          console.log(`- ${migration.id} | ${migration.name} (${new Date(migration.timestamp).toISOString()})`);
        }
      }
      
      if (appliedMigrations.length > 0) {
        console.log(`\nApplied Migrations (most recent first):`);
        for (const migration of appliedMigrations) {
          console.log(`- ${migration.migrationId} | ${migration.name} (${migration.appliedAt.toISOString()})`);
        }
      }
      
      console.log('');
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  }
}

@Command({ name: 'migration:run', description: 'Run pending migrations' })
export class MigrationRunCommand extends CommandRunner {
  constructor(private readonly migrationService: MigrationService) {
    super();
  }

  @Option({
    flags: '-s, --skip-backup',
    description: 'Skip database backup before migration',
  })
  parseSkipBackup(val: string): boolean {
    return true;
  }

  @Option({
    flags: '-v, --skip-validation',
    description: 'Skip data validation',
  })
  parseSkipValidation(val: string): boolean {
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
      const pendingMigrations = await this.migrationService.getPendingMigrations();
      
      if (pendingMigrations.length === 0) {
        console.log('No pending migrations to run');
        return;
      }
      
      console.log(`Running ${pendingMigrations.length} pending migrations...`);
      
      const results = await this.migrationService.applyPendingMigrations({
        createBackup: !options?.skipBackup,
        validate: !options?.skipValidation,
        transaction: !options?.skipTransaction,
      });
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;
      
      console.log(`\nMigration Results:`);
      console.log(`- Successful: ${successCount}`);
      console.log(`- Failed: ${failureCount}`);
      
      if (failureCount > 0) {
        console.log(`\nFailed Migrations:`);
        for (const result of results.filter(r => !r.success)) {
          console.log(`- ${result.migrationId} | ${result.name}`);
          console.log(`  Error: ${result.error}`);
        }
        
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  }
}

@Command({ name: 'migration:apply', description: 'Apply a specific migration' })
export class MigrationApplyCommand extends CommandRunner {
  constructor(private readonly migrationService: MigrationService) {
    super();
  }

  @Option({
    flags: '-s, --skip-backup',
    description: 'Skip database backup before migration',
  })
  parseSkipBackup(val: string): boolean {
    return true;
  }

  @Option({
    flags: '-v, --skip-validation',
    description: 'Skip data validation',
  })
  parseSkipValidation(val: string): boolean {
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
        console.error('Error: Migration ID is required');
        process.exit(1);
      }
      
      const migrationId = passedParams[0];
      
      console.log(`Applying migration ${migrationId}...`);
      
      const result = await this.migrationService.applyMigration(migrationId, {
        createBackup: !options?.skipBackup,
        validate: !options?.skipValidation,
        transaction: !options?.skipTransaction,
      });
      
      if (result.success) {
        console.log(`Migration ${migrationId} applied successfully`);
      } else {
        console.error(`Migration ${migrationId} failed: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  }
}

@Command({ name: 'migration:test', description: 'Test a migration' })
export class MigrationTestCommand extends CommandRunner {
  constructor(private readonly testingService: TestingService) {
    super();
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    try {
      if (passedParams.length === 0) {
        console.error('Error: Migration ID is required');
        process.exit(1);
      }
      
      const migrationId = passedParams[0];
      
      console.log(`Testing migration ${migrationId}...`);
      
      const result = await this.testingService.testMigration(migrationId);
      
      console.log(`\nTest Results for ${migrationId}:`);
      console.log(`- Apply (up): ${result.results.up ? 'SUCCESS' : 'FAILED'}`);
      console.log(`- Revert (down): ${result.results.down ? 'SUCCESS' : 'FAILED'}`);
      console.log(`- Validation: ${result.results.validation ? 'SUCCESS' : 'FAILED'}`);
      
      if (result.results.test !== undefined) {
        console.log(`- Custom test: ${result.results.test ? 'SUCCESS' : 'FAILED'}`);
      }
      
      if (result.errors && result.errors.length > 0) {
        console.log(`\nErrors:`);
        for (const error of result.errors) {
          console.log(`- ${error}`);
        }
        
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  }
}
