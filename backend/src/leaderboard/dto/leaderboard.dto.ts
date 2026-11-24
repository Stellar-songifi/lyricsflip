import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const LEADERBOARD_WINDOWS = ['daily', 'weekly', 'all'] as const;
export type LeaderboardWindow = (typeof LEADERBOARD_WINDOWS)[number];

export const LEADERBOARD_METRICS = ['wins', 'points', 'streak'] as const;
export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];

export const MAX_LEADERBOARD_PAGE_SIZE = 100;

export class LeaderboardQueryDto {
  @ApiPropertyOptional({
    enum: LEADERBOARD_WINDOWS,
    default: 'all',
    description:
      'daily = since 00:00 UTC today, weekly = last 7 UTC days incl. today',
  })
  @IsOptional()
  @IsIn(LEADERBOARD_WINDOWS)
  window?: LeaderboardWindow = 'all';

  @ApiPropertyOptional({
    enum: LEADERBOARD_METRICS,
    default: 'wins',
    description:
      'wins = rounds won, points = total points, streak = best answer streak',
  })
  @IsOptional()
  @IsIn(LEADERBOARD_METRICS)
  metric?: LeaderboardMetric = 'wins';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: MAX_LEADERBOARD_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LEADERBOARD_PAGE_SIZE)
  limit?: number = 20;
}

export class LeaderboardRankQueryDto {
  @ApiPropertyOptional({ enum: LEADERBOARD_WINDOWS, default: 'all' })
  @IsOptional()
  @IsIn(LEADERBOARD_WINDOWS)
  window?: LeaderboardWindow = 'all';

  @ApiPropertyOptional({ enum: LEADERBOARD_METRICS, default: 'wins' })
  @IsOptional()
  @IsIn(LEADERBOARD_METRICS)
  metric?: LeaderboardMetric = 'wins';
}

export class LeaderboardEntryDto {
  @ApiProperty({ description: '1-based position on the board' })
  rank: number;

  @ApiProperty({ description: 'Stellar address of the player' })
  address: string;

  @ApiProperty({ description: 'Value of the requested metric' })
  score: number;
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

  /**
   * Moderation status of the address.
   *
   * Null means no flags exist. 'hidden' or 'banned' means an admin has
   * suppressed this entry; public leaderboard responses omit those entries
   * entirely, but admin-facing responses include them with this field set.
   *
   * Possible values: 'pending' | 'reviewed' | 'hidden' | 'banned' | null
   */
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Anti-cheat moderation status. Null = no flags. ' +
      "'hidden'/'banned' entries are suppressed on public leaderboards.",
  })
  flagStatus: string | null;
}

export class PaginatedLeaderboardDto {
  @ApiProperty({ enum: LEADERBOARD_WINDOWS })
  window: LeaderboardWindow;

  @ApiProperty({ enum: LEADERBOARD_METRICS })
  metric: LeaderboardMetric;

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

export class PlayerRankDto {
  @ApiProperty()
  address: string;

  @ApiProperty({ enum: LEADERBOARD_WINDOWS })
  window: LeaderboardWindow;

  @ApiProperty({ enum: LEADERBOARD_METRICS })
  metric: LeaderboardMetric;

  @ApiProperty({ description: '1-based position on the board' })
  rank: number;

  @ApiProperty({ description: 'Value of the requested metric' })
  score: number;

  @ApiProperty({ description: 'Number of players on the board' })
  total: number;
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

  @ApiPropertyOptional({ description: 'Current consecutive-win streak' })
  currentStreak?: number;

  @ApiProperty()
  correctAnswers: number;

  @ApiProperty()
  totalAnswers: number;
}

export class PlayerRecentRoundDto {
  @ApiProperty({ description: 'Round identifier' })
  roundId: string;

  @ApiProperty({ description: 'Genre of the round' })
  genre: string;

  @ApiProperty({ description: 'Points earned in the round' })
  points: number;

  @ApiProperty({ description: 'Correct answers in the round' })
  correctAnswers: number;

  @ApiProperty({ description: 'Total answers submitted in the round' })
  totalAnswers: number;

  @ApiProperty({ description: 'Whether the player won the round' })
  won: boolean;

  @ApiProperty({ description: 'When the round was played (ISO 8601)' })
  playedAt: string;
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
  rank?: number | null;

  @ApiPropertyOptional()
  username?: string;

  @ApiProperty({ type: PlayerStatsDto })
  stats: PlayerStatsDto;

  @ApiProperty({ type: [PlayerRecentRoundDto] })
  recentRounds: PlayerRecentRoundDto[];

  @ApiProperty({ type: [PlayerBadgeDto] })
  badges: PlayerBadgeDto[];

  @ApiProperty({ description: 'Total unclaimed amount, in stroops' })
  unclaimedWinnings: string;
}
