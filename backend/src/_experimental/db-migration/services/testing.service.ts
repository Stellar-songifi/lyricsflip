// src/db-migration/services/testing.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Connection } from 'typeorm';
import { Migration } from '../interfaces/migration.interface';
import { MigrationService } from './migration.service';
import { RollbackService } from './rollback.service';
import { ValidatorService } from './validator.service';

@Injectable()
export class TestingService {
  private readonly logger = new Logger(TestingService.name);

  constructor(
    private connection: Connection,
    private migrationService: MigrationService,
    private rollbackService: RollbackService,
    private validatorService: ValidatorService,
  ) {}

  /**
   * Test a migration
   */
  async testMigration(migrationId: string): Promise<{
    success: boolean;
    results: {
      up: boolean;
      down: boolean;
      validation: boolean;
      test?: boolean;
    };
    errors?: string[];
  }> {
    try {
      // Get migration
      const migrations = await this.migrationService['migrations'];
      const migration = migrations.get(migrationId);
      
      if (!migration) {
        throw new Error(`Migration ${migrationId} not found`);
      }
      
      // Create test connection using the same config but with a separate schema
      // This is a simplified approach for the example
      const testSchema = `test_${migrationId.substring(0, 8)}`;
      
      // Create a schema for testing (this is PostgreSQL specific)
      const queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      
      try {
        // Create test schema
        await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ${testSchema}`);
        
        const errors: string[] = [];
        const results = {
          up: false,
          down: false,
          validation: false,
          test: undefined as boolean | undefined,
        };
        
        try {
          // Test migration up
          await this.testMigrationUp(migration, queryRunner, testSchema);
          results.up = true;
          
          // Test validation if available
          if (migration.validateAfter) {
            const validationResult = await migration.validateAfter(queryRunner);
            results.validation = validationResult;
            
            if (!validationResult) {
              errors.push('Post-migration validation failed');
            }
          }
          
          // Run migration-specific tests if available
          if (migration.test) {
            const testResult = await migration.test(queryRunner);
            results.test = testResult;
            
            if (!testResult) {
              errors.push('Migration test failed');
            }
          }
          
          // Test migration down
          await this.testMigrationDown(migration, queryRunner);
          results.down = true;
        } catch (error) {
          errors.push(`Test error: ${error.message}`);
          this.logger.error(`Migration test error: ${error.message}`, error.stack);
        }
        
        return {
          success: errors.length === 0 && results.up && results.down,
          results,
          errors: errors.length > 0 ? errors : undefined,
        };
      } finally {
        // Drop test schema
        await queryRunner.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
        
        // Release query runner
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error(`Error testing migration: ${error.message}`, error.stack);
      
      return {
        success: false,
        results: {
          up: false,
          down: false,
          validation: false,
        },
        errors: [`Error in test setup: ${error.message}`],
      };
    }
  }

  /**
   * Test migration up
   */
  private async testMigrationUp(
    migration: Migration, 
    queryRunner: any,
    schema: string,
  ): Promise<void> {
    // Set search path to test schema (PostgreSQL specific)
    await queryRunner.query(`SET search_path TO ${schema}`);
    
    // Run pre-validation if available
    if (migration.validateBefore) {
      const validationResult = await migration.validateBefore(queryRunner);
      if (!validationResult) {
        throw new Error('Pre-migration validation failed in test');
      }
    }
    
    // Run migration up
    await migration.up(queryRunner);
  }

  /**
   * Test migration down
   */
  private async testMigrationDown(
    migration: Migration, 
    queryRunner: any,
  ): Promise<void> {
    // Run migration down
    await migration.down(queryRunner);
  }

  /**
   * Test migrations in sequence
   */
  async testMigrationSequence(migrationIds: string[]): Promise<{
    success: boolean;
    results: Record<string, {
      up: boolean;
      down: boolean;
      validation: boolean;
      test?: boolean;
    }>;
    errors?: Record<string, string[]>;
  }> {
    try {
      const results: Record<string, {
        up: boolean;
        down: boolean;
        validation: boolean;
        test?: boolean;
      }> = {};
      
      const errors: Record<string, string[]> = {};
      let hasErrors = false;
      
      // Test each migration in the sequence
      for (const migrationId of migrationIds) {
        const migrationResult = await this.testMigration(migrationId);
        
        results[migrationId] = migrationResult.results;
        
        if (!migrationResult.success) {
          hasErrors = true;
          errors[migrationId] = migrationResult.errors || ['Unknown error'];
        }
      }
      
      return {
        success: !hasErrors,
        results,
        errors: hasErrors ? errors : undefined,
      };
    } catch (error) {
      this.logger.error(`Error testing migration sequence: ${error.message}`, error.stack);
      
      return {
        success: false,
        results: {},
        errors: {
          general: [`Error in test sequence: ${error.message}`],
        },
      };
    }
  }
}
