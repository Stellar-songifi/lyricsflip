import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Genre } from '../enums/genre.enum';
import { SongDifficulty } from '../enums/song-difficulty.enum';

export class CreateSongDto {
  @ApiPropertyOptional({ description: 'Contract card_id, once the card is on-chain' })
  @IsOptional()
  @IsNumberString()
  onChainCardId?: string;

  @ApiProperty({ enum: Genre })
  @IsEnum(Genre)
  genre: Genre;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  artist: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsInt()
  @Min(1000)
  @Max(9999)
  year: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  lyrics: string;

  @ApiPropertyOptional({ enum: SongDifficulty })
  @IsOptional()
  @IsEnum(SongDifficulty)
  difficulty?: SongDifficulty;

  @ApiPropertyOptional({ type: [String], description: 'Tag names' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ description: 'Where the lyric text came from' })
  @IsNotEmpty()
  @IsString()
  source: string;

  @ApiProperty({ description: 'SPDX identifier or LicenseRef-<provider>' })
  @IsNotEmpty()
  @IsString()
  license: string;
}
