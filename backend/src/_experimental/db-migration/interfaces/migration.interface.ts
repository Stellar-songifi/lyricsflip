// src/db-migration/interfaces/migration.interface.ts
export interface Migration {
    /**
     * Unique identifier for the migration
     */
    id: string;
    
    /**
     * Human-readable name for the migration
     */
    name: string;
    
    /**
     * Optional description of what the migration does
     */
    description?: string;
    
    /**
     * Timestamp when the migration was created
     */
    timestamp: number;
    
    /**
     * List of migration IDs that must be applied before this one
     */
    dependencies?: string[];
    
    /**
     * Function to apply the migration
     */
    up: (queryRunner: any) => Promise<void>;
    
    /**
     * Function to revert the migration
     */
    down: (queryRunner: any) => Promise<void>;
    
    /**
     * Optional pre-validation function
     */
    validateBefore?: (queryRunner: any) => Promise<boolean>;
    
    /**
     * Optional post-validation function
     */
    validateAfter?: (queryRunner: any) => Promise<boolean>;
    
    /**
     * Optional function to test the migration
     */
    test?: (queryRunner: any) => Promise<boolean>;
  }
  