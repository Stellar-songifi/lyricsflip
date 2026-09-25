// src/db-migration/interfaces/backup.interface.ts
export interface BackupProvider {
    /**
     * Name of the backup provider
     */
    name: string;
    
    /**
     * Create a backup of the database
     */
    createBackup(connectionOptions: any, metadata: any): Promise<BackupResult>;
    
    /**
     * Restore a database from a backup
     */
    restoreBackup(backupId: string, connectionOptions: any): Promise<boolean>;
    
    /**
     * List available backups
     */
    listBackups(filter?: any): Promise<BackupInfo[]>;
    
    /**
     * Delete a backup
     */
    deleteBackup(backupId: string): Promise<boolean>;
  }
  
  export interface BackupResult {
    /**
     * Unique identifier for the backup
     */
    backupId: string;
    
    /**
     * Success status
     */
    success: boolean;
    
    /**
     * Timestamp of the backup
     */
    timestamp: number;
    
    /**
     * Size of the backup in bytes
     */
    size?: number;
    
    /**
     * Location where the backup is stored
     */
    location?: string;
    
    /**
     * Error message if backup failed
     */
    error?: string;
  }
  
  export interface BackupInfo {
    /**
     * Unique identifier for the backup
     */
    backupId: string;
    
    /**
     * Timestamp of the backup
     */
    timestamp: number;
    
    /**
     * Size of the backup in bytes
     */
    size: number;
    
    /**
     * Migration ID if backup was before a migration
     */
    migrationId?: string;
    
    /**
     * Additional metadata
     */
    metadata?: any;
  }
  