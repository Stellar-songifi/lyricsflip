import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Genre } from '../enums/genre.enum';
import { SongDifficulty } from '../enums/song-difficulty.enum';

export const SONG_SORT_FIELDS = ['title', 'artist', 'year', 'playCount', 'createdAt'] as const;
export type SongSortField = (typeof SONG_SORT_FIELDS)[number];

export class QuerySongsDto {
  @ApiPropertyOptional({ description: 'Matches title or artist' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: Genre })
  @IsOptional()
  @IsEnum(Genre)
  genre?: Genre;

  @ApiPropertyOptional({ enum: SongDifficulty })
  @IsOptional()
  @IsEnum(SongDifficulty)
  difficulty?: SongDifficulty;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ enum: SONG_SORT_FIELDS })
  @IsOptional()
  @IsIn(SONG_SORT_FIELDS)
  sortBy?: SongSortField;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
