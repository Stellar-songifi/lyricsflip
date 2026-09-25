// src/db-migration/interfaces/validator.interface.ts
export interface DataValidator {
    /**
     * Name of the validator
     */
    name: string;
    
    /**
     * Validates data against a schema or set of rules
     */
    validate(data: any, schema: any): Promise<ValidationResult>;
  }
  
  export interface ValidationResult {
    /**
     * Whether validation passed
     */
    valid: boolean;
    
    /**
     * Error messages if validation failed
     */
    errors?: string[];
    
    /**
     * Warnings that don't cause validation to fail
     */
    warnings?: string[];
  }