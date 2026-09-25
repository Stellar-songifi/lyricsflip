// src/practice/dto/create-practice-item.dto.ts
import { IsString, IsEnum, IsObject, IsArray, IsOptional, IsBoolean } from 'class-validator';
import { Difficulty } from '../enums/difficulty.enum';
import { Genre } from '../../songs/enums/genre.enum';
import { ItemType } from '../enums/item-type.enum';

export class CreatePracticeItemDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsEnum(ItemType)
  type: ItemType;

  @IsEnum(Difficulty)
  difficulty: Difficulty;

  @IsEnum(Genre)
  genre: Genre;

  @IsObject()
  metadata: Record<string, any>;

  @IsArray()
  @IsOptional()
  hints?: string[];

  @IsObject()
  solution: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}
