// src/geolocation/dtos/location.dto.ts
import { IsString, IsOptional, IsNumber, IsBoolean, IsObject } from 'class-validator';

export class LocationDto {
  @IsString()
  ip: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  isp?: string;

  @IsOptional()
  @IsString()
  asn?: string;

  @IsOptional()
  @IsObject()
  additionalData?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isRestricted?: boolean;
}

