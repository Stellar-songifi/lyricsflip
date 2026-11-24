import { ApiProperty } from '@nestjs/swagger';

/**
 * Response shape for POST /admin/songs/publish.
 *
 * The endpoint does NOT submit the transaction itself — the API holds no
 * secret key (LF-227).  Instead it returns an unsigned XDR for each batch
 * so the admin wallet can sign and submit them in the admin UI (LF-219).
 *
 * Each element of `batches` corresponds to one add_cards call.  The admin
 * must sign and submit all of them (order does not matter) to publish the
 * full set of approved cards.
 *
 * `songIds` lists the database UUIDs of every song included across all
 * batches; call POST /admin/songs/:id/mark-published with the returned
 * card_id once a signed transaction has been confirmed on-chain.
 */
export class PublishBatchDto {
  @ApiProperty({ description: 'Unsigned add_cards transaction XDR.' })
  xdr: string;

  @ApiProperty({
    type: [String],
    description: 'Database UUIDs of the songs in this batch, in wire order.',
  })
  songIds: string[];
}

export class PublishResultDto {
  @ApiProperty({ description: 'Total number of approved songs batched.' })
  total: number;

  @ApiProperty({
    type: [PublishBatchDto],
    description: 'One entry per add_cards batch (max 20 cards each).',
  })
  batches: PublishBatchDto[];
}
