// src/practice/dto/create-session.dto.ts
import { IsEnum, IsOptional } from 'class-validator';
import { Difficulty } from '../enums/difficulty.enum';
import { Genre } from '../../songs/enums/genre.enum';

export class CreateSessionDto {
  @IsEnum(Difficulty)
  @IsOptional()
  difficulty?: Difficulty = Difficulty.MEDIUM;

  @IsEnum(Genre)
  @IsOptional()
  genre?: Genre;
}
