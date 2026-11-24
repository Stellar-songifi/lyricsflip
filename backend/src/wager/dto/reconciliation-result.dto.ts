import { ApiProperty } from '@nestjs/swagger';

/**
 * LF-340: Snapshot of the most recent nightly wager reconciliation. Exposed
 * via GET /wagers/reconciliation-status for the monitoring panel.
 */
export class ReconciliationResultDto {
  @ApiProperty({ description: 'When the reconciliation job last ran.' })
  checkedAt: string;

  @ApiProperty({
    description: 'Sum of escrowed wager amounts in the database, per asset.',
    example: { native: '1500000000' },
  })
  dbEscrowedTotals: Record<string, string>;

  @ApiProperty({
    description: 'Escrow contract token balance read from the chain, per asset.',
    example: { native: '1500000000' },
  })
  contractBalances: Record<string, string>;

  @ApiProperty({
    description: 'Per-asset difference (contract balance minus DB escrowed total).',
    example: { native: '0' },
  })
  differences: Record<string, string>;

  @ApiProperty({ description: 'True when every asset matches within the tolerance.' })
  matched: boolean;

  @ApiProperty({
    required: false,
    description: 'Human-readable summary when a mismatch is detected.',
  })
  alert?: string;
}
