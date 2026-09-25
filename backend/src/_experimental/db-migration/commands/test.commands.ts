// src/db-migration/commands/test.commands.ts
import { Command, CommandRunner } from 'nest-commander';
import { TestingService } from '../services/testing.service';

@Command({ name: 'migration:test-sequence', description: 'Test migrations in sequence' })
export class MigrationTestSequenceCommand extends CommandRunner {
  constructor(private readonly testingService: TestingService) {
    super();
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    try {
      if (passedParams.length === 0) {
        console.error('Error: At least one migration ID is required');
        process.exit(1);
      }
      
      const migrationIds = passedParams;
      
      console.log(`Testing sequence of ${migrationIds.length} migrations...`);
      
      const result = await this.testingService.testMigrationSequence(migrationIds);
      
      console.log(`\nTest Results:`);
      
      for (const [migrationId, migrationResult] of Object.entries(result.results)) {
        console.log(`\nMigration ${migrationId}:`);
        console.log(`- Apply (up): ${migrationResult.up ? 'SUCCESS' : 'FAILED'}`);
        console.log(`- Revert (down): ${migrationResult.down ? 'SUCCESS' : 'FAILED'}`);
        console.log(`- Validation: ${migrationResult.validation ? 'SUCCESS' : 'FAILED'}`);
        
        if (migrationResult.test !== undefined) {
          console.log(`- Custom test: ${migrationResult.test ? 'SUCCESS' : 'FAILED'}`);
        }
        
        if (result.errors && result.errors[migrationId]) {
          console.log(`\nErrors:`);
          for (const error of result.errors[migrationId]) {
            console.log(`- ${error}`);
          }
        }
      }
      
      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  }
}
