// src/sync/dto/delta-update.dto.ts
import { IsNotEmpty, IsNumber, IsObject, IsString } from 'class-validator';

export class DeltaUpdateDto<T> {
  @IsString()
  @IsNotEmpty()
  userId: string;
  
  @IsString()
  @IsNotEmpty()
  dataType: string;
  
  @IsNumber()
  baseVersion: number;
  
  @IsObject()
  changes: Partial<T>;
}