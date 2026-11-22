import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ModerationStatus } from '../entities/player-flag.entity';

/** Query params accepted by the moderation queue list endpoint. */
export class ModerationQueueQueryDto {
  @ApiPropertyOptional({
    enum: ModerationStatus,
    default: ModerationStatus.PENDING,
    description: 'Filter by moderation status (omit for all)',
  })
  @IsOptional()
  @IsEnum(ModerationStatus)
  status?: ModerationStatus;

  @ApiPropertyOptional({ description: 'Filter to a specific Stellar address' })
  @IsOptional()
  @IsString()
  address?: string;
}

/** Body accepted by PATCH /admin/anti-cheat/flags/:id. */
export class ReviewFlagDto {
  @ApiProperty({
    enum: ModerationStatus,
    description: 'New moderation status to apply',
  })
  @IsEnum(ModerationStatus)
  status: ModerationStatus;

  @ApiPropertyOptional({ description: 'Optional reviewer note' })
  @IsOptional()
  @IsString()
  reviewerNote?: string;
}

/** Response shape for a single flag entry. */
export class PlayerFlagDto {
  @ApiProperty() id: string;
  @ApiProperty() address: string;
  @ApiProperty() roundId: string;
  @ApiProperty({ type: [String] }) reasons: string[];
  @ApiProperty() totalAnswers: number;
  @ApiProperty() correctAnswers: number;
  @ApiProperty() accuracy: number;
  @ApiPropertyOptional({ nullable: true }) medianAnswerTimeS: number | null;
  @ApiProperty({ enum: ModerationStatus }) status: ModerationStatus;
  @ApiPropertyOptional({ nullable: true }) reviewerNote: string | null;
  @ApiPropertyOptional({ nullable: true }) reviewedBy: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
