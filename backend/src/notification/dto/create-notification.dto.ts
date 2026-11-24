import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNotificationDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  type: string;

  @ApiProperty({ description: 'Short heading shown in notification toasts.' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ description: 'Full notification body text.' })
  @IsNotEmpty()
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: 'Arbitrary JSON payload (roundId, position, …).' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
