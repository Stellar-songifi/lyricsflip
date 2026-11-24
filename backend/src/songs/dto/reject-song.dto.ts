import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body for POST /admin/songs/:id/reject.
 * A reason is required so the submitter and audit log always have context.
 */
export class RejectSongDto {
  @ApiProperty({
    description: 'Human-readable reason for rejection (shown to submitter and stored in the audit log).',
    maxLength: 1000,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(1000)
  reason: string;
}
