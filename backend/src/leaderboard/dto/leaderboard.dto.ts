import { IsIn, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type LeaderboardPeriod = 'all' | 'weekly' | 'daily';

export const LEADERBOARD_PERIODS: readonly LeaderboardPeriod[] = [
  'all',
  'weekly',
  'daily',
];

export class LeaderboardQueryDto {
  @ApiPropertyOptional({ enum: LEADERBOARD_PERIODS, default: 'all' })
  @IsOptional()
  @IsIn(LEADERBOARD_PERIODS)
  period?: LeaderboardPeriod = 'all';

  @ApiPropertyOptional({
    description: 'Filter to a single genre; omit for all genres',
  })
  @IsOptional()
  @IsString()
  genre?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  limit?: number = 20;
}

export class LeaderboardEntryDto {
  @ApiProperty()
  rank: number;

  @ApiProperty()
  address: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  roundsWon: number;

  @ApiProperty({ description: 'roundsWon / roundsPlayed, in [0, 1]' })
  winRate: number;

  @ApiProperty()
  maxStreak: number;
}

export class PaginatedLeaderboardDto {
  @ApiProperty({ type: [LeaderboardEntryDto] })
  data: LeaderboardEntryDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}
