// src/db-migration/services/validator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection } from 'typeorm';
import { DataValidator, ValidationResult } from '../interfaces/validator.interface';

@Injectable()
export class ValidatorService {
  private readonly logger = new Logger(ValidatorService.name);
  private readonly validators: Map<string, DataValidator> = new Map();

  constructor(
    @InjectConnection()
    private connection: Connection,
  ) {}

  /**
   * Register a data validator
   */
  registerValidator(validator: DataValidator): void {
    this.validators.set(validator.name, validator);
    this.logger.log(`Registered validator: ${validator.name}`);
  }

  /**
   * Get a validator by name
   */
  getValidator(name: string): DataValidator | undefined {
    return this.validators.get(name);
  }

  /**
   * List all registered validators
   */
  listValidators(): DataValidator[] {
    return Array.from(this.validators.values());
  }

  /**
   * Validate table schema
   */
  async validateTableSchema(tableName: string, schema: any): Promise<ValidationResult> {
    try {
      const queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      
      try {
        // Get table information from database
        const table = await queryRunner.getTable(tableName);
        
        if (!table) {
          return {
            valid: false,
            errors: [`Table ${tableName} does not exist`],
          };
        }
        
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // Check columns
        for (const columnDef of schema.columns) {
          const column = table.findColumnByName(columnDef.name);
          
          if (!column) {
            errors.push(`Column ${columnDef.name} not found in table ${tableName}`);
            continue;
          }
          
          // Check column type
          if (columnDef.type && !this.isCompatibleType(column.type, columnDef.type)) {
            errors.push(
              `Column ${columnDef.name} has type ${column.type} but expected ${columnDef.type}`
            );
          }
          
          // Check if nullable
          if (columnDef.nullable !== undefined && column.isNullable !== columnDef.nullable) {
            errors.push(
              `Column ${columnDef.name} has nullable=${column.isNullable} but expected ${columnDef.nullable}`
            );
          }
        }
        
        // Check if any columns are in the table but not in the schema
        for (const column of table.columns) {
          const columnDef = schema.columns.find(c => c.name === column.name);
          
          if (!columnDef && !column.isGenerated) {
            warnings.push(`Column ${column.name} exists in table but not in schema`);
          }
        }
        
        return {
          valid: errors.length === 0,
          errors: errors.length > 0 ? errors : undefined,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      } finally {
        // Release query runner
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error(`Error validating table schema: ${error.message}`, error.stack);
      
      return {
        valid: false,
        errors: [`Error validating schema: ${error.message}`],
      };
    }
  }

  /**
   * Validate data integrity
   */
  async validateDataIntegrity(
    tableName: string, 
    conditions: any[],
  ): Promise<ValidationResult> {
    try {
      const queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      
      try {
        const errors: string[] = [];
        
        // Check each condition
        for (const condition of conditions) {
          // Build validation query
          let query = `SELECT COUNT(*) as count FROM ${tableName} WHERE `;
          
          if (typeof condition === 'string') {
            // Raw SQL condition
            query += condition;
          } else if (typeof condition === 'object') {
            // Object with column-value pairs
            const clauses = Object.entries(condition)
              .map(([column, value]) => {
                if (value === null) {
                  return `${column} IS NULL`;
                } else if (typeof value === 'string') {
                  return `${column} = '${value.replace(/'/g, "''")}'`;
                } else {
                  return `${column} = ${value}`;
                }
              });
            
            query += clauses.join(' AND ');
          }
          
          // Execute validation query
          const result = await queryRunner.query(query);
          const count = parseInt(result[0]?.count || '0', 10);
          
          if (count === 0) {
            errors.push(`Data integrity check failed: ${query}`);
          }
        }
        
        return {
          valid: errors.length === 0,
          errors: errors.length > 0 ? errors : undefined,
        };
      } finally {
        // Release query runner
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error(`Error validating data integrity: ${error.message}`, error.stack);
      
      return {
        valid: false,
        errors: [`Error validating data integrity: ${error.message}`],
      };
    }
  }

  /**
   * Validate custom constraint
   */
  async validateCustomConstraint(
    constraint: (queryRunner: any) => Promise<{ valid: boolean; message?: string }>,
  ): Promise<ValidationResult> {
    try {
      const queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      
      try {
        const result = await constraint(queryRunner);
        
        return {
          valid: result.valid,
          errors: result.valid ? undefined : [result.message || 'Custom constraint failed'],
        };
      } finally {
        // Release query runner
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error(`Error validating custom constraint: ${error.message}`, error.stack);
      
      return {
        valid: false,
        errors: [`Error validating custom constraint: ${error.message}`],
      };
    }
  }

  /**
   * Check if database column types are compatible
   */
  private isCompatibleType(actual: string, expected: string): boolean {
    // Normalize types to lowercase
    const normalizedActual = actual.toLowerCase();
    const normalizedExpected = expected.toLowerCase();
    
    // Direct match
    if (normalizedActual === normalizedExpected) {
      return true;
    }
    
    // Handle type aliases and compatibility
    // For example, 'int' is compatible with 'integer'
    const compatibilityMap: Record<string, string[]> = {
      'int': ['integer', 'smallint', 'bigint'],
      'integer': ['int', 'smallint', 'bigint'],
      'varchar': ['character varying', 'text', 'string'],
      'text': ['varchar', 'character varying', 'string'],
      'float': ['double precision', 'real', 'decimal', 'numeric'],
      'numeric': ['decimal', 'float', 'double precision', 'real'],
      'boolean': ['bool'],
      'timestamp': ['timestamp without time zone', 'datetime'],
      'timestamptz': ['timestamp with time zone'],
    };
    
    // Check if actual type is compatible with expected type
    for (const [baseType, compatibleTypes] of Object.entries(compatibilityMap)) {
      if (
        (normalizedExpected === baseType && compatibleTypes.includes(normalizedActual)) ||
        (normalizedActual === baseType && compatibleTypes.includes(normalizedExpected))
      ) {
        return true;
      }
    }
    
    return false;
  }
}
