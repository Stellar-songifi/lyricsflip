import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';

// ─── Query DTOs ──────────────────────────────────────────────────────────────

export class OpenRoundsQueryDto {
  @ApiPropertyOptional({
    default: 1,
    description: 'Page number (1-based)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  page?: number = 1;

  @ApiPropertyOptional({
    default: 50,
    description: 'Maximum number of open rounds to return (capped at 50)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Filter by genre' })
  @IsOptional()
  @IsString()
  genre?: string;
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

/** One player inside an open-round response. */
export class RoundPlayerDto {
  @ApiProperty({ description: 'Stellar address of the player' })
  address: string;

  @ApiProperty({ description: 'Whether the player has signalled ready' })
  ready: boolean;

  @ApiPropertyOptional({ description: 'Ledger sequence when this player joined' })
  joinedLedger: number | null;
}

/** Summary of a single open (joinable) round, served from the index. */
export class OpenRoundDto {
  @ApiProperty({ description: 'On-chain round identifier' })
  roundId: string;

  @ApiPropertyOptional({ description: 'Stellar address of the round admin/owner' })
  admin: string | null;

  @ApiProperty({ description: 'Round status', example: 'open' })
  status: string | null;

  @ApiPropertyOptional({ description: 'Music genre for this round' })
  genre: string | null;

  @ApiProperty({ type: [RoundPlayerDto], description: 'Players who have joined' })
  players: RoundPlayerDto[];

  @ApiProperty({ description: 'Number of players currently in the round' })
  playerCount: number;

  @ApiPropertyOptional({ description: 'Ledger sequence when the round was created' })
  createdLedger: number | null;

  @ApiPropertyOptional({
    description:
      'ISO 8601 timestamp when the round started; null if not yet started',
  })
  startedAt: string | null;
}

/** Full round detail including final per-player results (if completed). */
export class RoundPlayerResultDto {
  @ApiProperty() address: string;
  @ApiProperty() won: boolean;
  @ApiProperty() points: number;
  @ApiProperty() correctAnswers: number;
  @ApiProperty() totalAnswers: number;
  @ApiProperty() streakAfter: number;
  @ApiPropertyOptional() ledger: number | null;
}

export class RoundDetailDto {
  @ApiProperty() roundId: string;
  @ApiPropertyOptional() admin: string | null;
  @ApiProperty() status: string | null;
  @ApiPropertyOptional() genre: string | null;
  @ApiProperty({ type: [RoundPlayerDto] }) players: RoundPlayerDto[];
  @ApiProperty() playerCount: number;
  @ApiPropertyOptional() createdLedger: number | null;
  @ApiPropertyOptional() startedAt: string | null;
  @ApiPropertyOptional() completedAt: string | null;
  @ApiPropertyOptional() txHash: string | null;

  /**
   * Per-player final results, present only after the round is completed.
   * Empty array when the round is still in progress.
   */
  @ApiProperty({ type: [RoundPlayerResultDto] })
  results: RoundPlayerResultDto[];
}

/** Paginated wrapper for the open-rounds list. */
export class PaginatedOpenRoundsDto {
  @ApiProperty({ type: [OpenRoundDto] }) data: OpenRoundDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
  @ApiProperty() totalPages: number;
}

// ─── Player stats DTO ────────────────────────────────────────────────────────

export class ChainPlayerStatsDto {
  @ApiProperty({ description: 'Stellar address queried' })
  address: string;

  @ApiProperty() roundsPlayed: number;
  @ApiProperty() roundsWon: number;

  @ApiProperty({ description: 'roundsWon / roundsPlayed, in [0, 1]' })
  winRate: number;

  @ApiProperty({ description: 'correctAnswers / totalAnswers, in [0, 1]' })
  accuracy: number;

  @ApiProperty() correctAnswers: number;
  @ApiProperty() totalAnswers: number;
  @ApiProperty() totalPoints: number;
  @ApiProperty() maxStreak: number;
  @ApiProperty({ description: 'Highest single-round score' })
  bestRoundScore: number;
}
