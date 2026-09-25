// src/game/dtos/queue-player.dto.ts
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class QueuePlayerDto {
  @IsString()
  modeId: string;
  
  @IsOptional()
  @IsNumber()
  skill?: number;
}