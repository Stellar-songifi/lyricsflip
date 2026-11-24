import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body for POST /admin/songs/:id/mark-published.
 *
 * After the admin wallet signs and submits the XDR returned by
 * POST /admin/songs/publish, the client calls this endpoint for each
 * song with the on-chain card_id the transaction produced.
 */
export class MarkPublishedDto {
  @ApiProperty({
    description: 'On-chain card_id returned by the add_cards transaction.',
  })
  @IsNotEmpty()
  @IsString()
  onChainCardId: string;
}
