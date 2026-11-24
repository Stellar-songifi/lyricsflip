import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Genre } from '../enums/genre.enum';
import { SongDifficulty } from '../enums/song-difficulty.enum';
import {
  ALLOWED_SPDX_LICENSES,
  LICENSE_REF_PREFIX,
} from '../constants/allowed-licenses';

/**
 * Payload for POST /songs/submit (public) and POST /admin/songs (admin).
 *
 * Both `source` and `license` are required at submission time — the content
 * policy (docs/content-policy.md) mandates attribution on every card.  The
 * license must be one of the values allowed by the policy; the service layer
 * enforces the allow-list via `isAllowedLicense()`.
 */
export class SubmitSongDto {
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

  @ApiProperty({ minimum: 1000, maximum: 9999 })
  @IsInt()
  @Min(1000)
  @Max(9999)
  year: number;

  @ApiProperty({
    description:
      'Lyric snippet. At most 20 words, single line/phrase (content-policy.md).',
  })
  @IsNotEmpty()
  @IsString()
  lyrics: string;

  @ApiPropertyOptional({ enum: SongDifficulty, default: SongDifficulty.MEDIUM })
  @IsOptional()
  @IsEnum(SongDifficulty)
  difficulty?: SongDifficulty;

  @ApiPropertyOptional({ type: [String], description: 'Tag names' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({
    description:
      'Where the lyric text came from, e.g. "Original demo lyrics written for LyricsFlip (CC0)".',
  })
  @IsNotEmpty()
  @IsString()
  source: string;

  @ApiProperty({
    description: [
      'SPDX identifier or LicenseRef-<provider> for licensed data.',
      `Allowed values: ${ALLOWED_SPDX_LICENSES.join(', ')}, or any ${LICENSE_REF_PREFIX}<provider>.`,
    ].join(' '),
  })
  @IsNotEmpty()
  @IsString()
  license: string;
}
