// src/sync/dto/sync-response.dto.ts
import { IsBoolean, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsDate } from 'class-validator';

export class SyncResponseDto<T> {
  @IsBoolean()
  success: boolean;
  
  @IsNumber()
  version: number;
  
  @IsObject()
  @IsOptional()
  data?: T;
  
  @IsBoolean()
  hasConflicts: boolean;
  
  @IsObject()
  @IsOptional()
  conflictDetails?: any;
  
  @IsDate()
  syncedAt: Date;
  
  @IsString()
  @IsOptional()
  strategyUsed?: string;
  
  @IsObject()
  @IsOptional()
  delta?: Partial<T>;
}
