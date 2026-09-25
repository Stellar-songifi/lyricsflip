// src/db-migration/db-migration.module.ts
import { DynamicModule, Module, Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MigrationHistory } from './entities/migration-history.entity';
import { MigrationLock } from './entities/migration-lock.entity';
import { BackupMetadata } from './entities/backup-metadata.entity';
import { MigrationService } from './services/migration.service';
import { RollbackService } from './services/rollback.service';
import { ValidatorService } from './services/validator.service';
import { BackupService } from './services/backup.service';
import { TestingService } from './services/testing.service';
import { DB_MIGRATION_DIR, DB_MIGRATION_BACKUP_DIR, DB_MIGRATION_DEFAULT_PROVIDER } from './db-migration.constants';
import { 
  MigrationStatusCommand, 
  MigrationRunCommand, 
  MigrationApplyCommand, 
  MigrationTestCommand 
} from './commands/migration.commands';
import { 
  MigrationRollbackCommand, 
  MigrationRollbackToCommand 
} from './commands/rollback.commands';
import { 
  BackupCreateCommand, 
  BackupRestoreCommand, 
  BackupListCommand, 
  BackupDeleteCommand 
} from './commands/backup.commands';
import { MigrationTestSequenceCommand } from './commands/test.commands';

interface DbMigrationModuleOptions {
  migrationDir?: string;
  backupDir?: string;
  defaultBackupProvider?: string;
  enableCli?: boolean;
}

@Module({})
export class DbMigrationModule {
  static register(options: DbMigrationModuleOptions = {}): DynamicModule {
    const {
      migrationDir = './migrations',
      backupDir = './backups',
      defaultBackupProvider = 'filesystem',
      enableCli = true,
    } = options;
    
    const providers: Provider[] = [
      {
        provide: DB_MIGRATION_DIR,
        useValue: migrationDir,
      },
      {
        provide: DB_MIGRATION_BACKUP_DIR,
        useValue: backupDir,
      },
      {
        provide: DB_MIGRATION_DEFAULT_PROVIDER,
        useValue: defaultBackupProvider,
      },
      MigrationService,
      RollbackService,
      ValidatorService,
      BackupService,
      TestingService,
    ];
    
    if (enableCli) {
      providers.push(
        MigrationStatusCommand,
        MigrationRunCommand,
        MigrationApplyCommand,
        MigrationTestCommand,
        MigrationRollbackCommand,
        MigrationRollbackToCommand,
        BackupCreateCommand,
        BackupRestoreCommand,
        BackupListCommand,
        BackupDeleteCommand,
        MigrationTestSequenceCommand,
      );
    }
    
    return {
      module: DbMigrationModule,
      imports: [
        TypeOrmModule.forFeature([
          MigrationHistory,
          MigrationLock,
          BackupMetadata,
        ]),
      ],
      providers,
      exports: [
        MigrationService,
        RollbackService,
        ValidatorService,
        BackupService,
        TestingService,
      ],
    };
  }
}

// 6. Example Usage (in app.module.ts)
/*
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DbMigrationModule } from './db-migration/db-migration.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'postgres',
      database: 'my_database',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: false, // Important: set to false when using migrations
    }),
    DbMigrationModule.register({
      migrationDir: './migrations',
      backupDir: './backups',
      enableCli: true,
    }),
  ],
})
export class AppModule {}
*/

// 7. Example Migration (in migrations/1677589200000-create-users-table.ts)
/*
import { QueryRunner } from 'typeorm';
import { Migration } from '../src/db-migration/interfaces/migration.interface';

const migration: Migration = {
  id: '1677589200000-create-users-table',
  name: 'Create Users Table',
  description: 'Creates the users table with basic fields',
  timestamp: 1677589200000,
  
  // Apply migration
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await queryRunner.query(`
      CREATE INDEX idx_users_email ON users(email)
    `);
  },
  
  // Rollback migration
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_email`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  },
  
  // Validate before applying (optional)
  async validateBefore(queryRunner: QueryRunner): Promise<boolean> {
    // Check if users table doesn't exist yet
    const result = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      ) as exists
    `);
    
    return !result[0].exists;
  },
  
  // Validate after applying (optional)
  async validateAfter(queryRunner: QueryRunner): Promise<boolean> {
    // Check if users table exists and has the correct columns
    const result = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'users'
    `);
    
    const columns = result.map(r => r.column_name);
    const requiredColumns = ['id', 'email', 'password', 'full_name', 'is_active', 'created_at', 'updated_at'];
    
    return requiredColumns.every(col => columns.includes(col));
  },
  
  // Test migration (optional)
  async test(queryRunner: QueryRunner): Promise<boolean> {
    // Test inserting and querying data
    try {
      // Insert test user
      await queryRunner.query(`
        INSERT INTO users (email, password, full_name)
        VALUES ('test@example.com', 'password123', 'Test User')
      `);
      
      // Query the inserted user
      const result = await queryRunner.query(`
        SELECT * FROM users WHERE email = 'test@example.com'
      `);
      
      return result.length === 1 && result[0].full_name === 'Test User';
    } catch (error) {
      return false;
    }
  },
};

export default migration;
*/
