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

  @ApiProperty({ description: 'Total points accumulated in the period' })
  totalPoints: number;

  @ApiProperty()
  roundsWon: number;

  @ApiProperty()
  roundsPlayed: number;

  @ApiProperty({ description: 'roundsWon / roundsPlayed, in [0, 1]' })
  winRate: number;

  @ApiProperty({
    description: 'Correct answers / total answers, in [0, 1]',
  })
  accuracy: number;

  @ApiProperty({ description: 'Highest single-round score in the period' })
  bestRoundScore: number;

  @ApiProperty()
  maxStreak: number;

  @ApiPropertyOptional()
  correctAnswers?: number;

  @ApiPropertyOptional()
  totalAnswers?: number;
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

export class PlayerStatsDto {
  @ApiProperty({ description: 'Total points accumulated across all rounds' })
  totalPoints: number;

  @ApiProperty()
  roundsPlayed: number;

  @ApiProperty()
  roundsWon: number;

  @ApiProperty({ description: 'roundsWon / roundsPlayed, in [0, 1]' })
  winRate: number;

  @ApiProperty({
    description: 'Correct answers / total answers, in [0, 1]',
  })
  accuracy: number;

  @ApiProperty()
  maxStreak: number;

  @ApiProperty({ description: 'Highest single-round score' })
  bestRoundScore: number;

  @ApiProperty({ description: 'Current consecutive-win streak' })
  currentStreak: number;
}

export class PlayerRecentRoundDto {
  @ApiProperty({ description: 'Round identifier' })
  roundId: string;

  @ApiProperty({ description: 'Genre of the round' })
  genre: string;

  @ApiProperty({ description: 'Points earned in the round' })
  score: number;

  @ApiProperty({ description: 'Correct answers in the round' })
  correctAnswers: number;

  @ApiProperty({ description: 'Total answers submitted in the round' })
  totalAnswers: number;

  @ApiProperty({ description: 'Whether the player won the round' })
  won: boolean;

  @ApiProperty({ description: 'Rank within the round, if available' })
  rank: number;

  @ApiProperty({ description: 'When the round completed (ISO 8601)' })
  completedAt: string;
}

export class PlayerBadgeDto {
  @ApiProperty({ description: 'Badge identifier' })
  id: string;

  @ApiProperty({ description: 'Human-readable badge name' })
  name: string;

  @ApiPropertyOptional({ description: 'Badge description' })
  description?: string;

  @ApiPropertyOptional({ description: 'When the badge was awarded (ISO 8601)' })
  awardedAt?: string;
}

export class UnclaimedWinningsDto {
  @ApiProperty({ description: 'Total unclaimed amount, in stroops' })
  total: string;

  @ApiProperty({ description: 'Asset/token symbol of the winnings' })
  asset: string;

  @ApiProperty({
    type: [String],
    description: 'Round identifiers with unclaimed winnings',
  })
  roundIds: string[];
}

export class PlayerProfileDto {
  @ApiProperty()
  address: string;

  @ApiPropertyOptional()
  username?: string;

  @ApiProperty({ type: PlayerStatsDto })
  stats: PlayerStatsDto;

  @ApiProperty({ type: [PlayerRecentRoundDto] })
  recentRounds: PlayerRecentRoundDto[];

  @ApiProperty({ type: [PlayerBadgeDto] })
  badges: PlayerBadgeDto[];

  @ApiProperty({ type: UnclaimedWinningsDto })
  unclaimedWinnings: UnclaimedWinningsDto;
}
