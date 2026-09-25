// src/sync/dto/sync-request.dto.ts
import { IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsDate, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DeviceInfoDto {
  @IsString()
  @IsNotEmpty()
  deviceId: string;
  
  @IsString()
  platform: string;
  
  @IsString()
  @IsOptional()
  appVersion?: string;
}

export class SyncRequestDto<T> {
  @IsString()
  @IsNotEmpty()
  userId: string;
  
  @IsString()
  @IsNotEmpty()
  dataType: string;
  
  @IsNumber()
  version: number;
  
  @IsObject()
  data: T;
  
  @IsDate()
  @Type(() => Date)
  timestamp: Date;
  
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo: DeviceInfoDto;
  
  @IsOptional()
  @IsObject()
  delta?: Partial<T>;
  
  @IsOptional()
  @IsNumber()
  baseVersion?: number;
}