// src/voice/dto/create-room.dto.ts
import { IsString, IsNotEmpty, IsInt, IsOptional, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateRoomDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @IsOptional()
  @Min(2)
  @Max(50)
  @Transform(({ value }) => parseInt(value, 10))
  maxParticipants?: number = 10;
}
