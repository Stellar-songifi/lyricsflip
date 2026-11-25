import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * LF-339: Thin query wrapper over the `chain_round_player` table that the
 * indexer populates from on-chain `RoundJoined` events.  Used by game
 * gateways to verify that a socket identity is an actual player in a round
 * before accepting gameplay events from it.
 *
 * Column layout (from ChainRoundPlayer entity / AddIndexerSchema migration):
 *   round_id  varchar(128)   — matches the on-chain u64 round id stored as text
 *   player    varchar(128)   — Stellar account address (G…)
 */
@Injectable()
export class RoundPlayersRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Returns `true` when `address` appears in `chain_round_player` for the
   * given round.  Falls back to checking `userId` (the JWT `sub`) against the
   * `player` column for email/password accounts whose on-chain address may not
   * be known yet.
   */
  async isPlayerInRound(
    roundId: number | string,
    address?: string,
    userId?: string,
  ): Promise<boolean> {
    if (!address && !userId) return false;

    const rows = await this.dataSource.query<unknown[]>(
      `SELECT 1
         FROM chain_round_player
        WHERE round_id = $1
          AND player = ANY($2::text[])
        LIMIT 1`,
      [
        String(roundId),
        [address, userId].filter((v): v is string => Boolean(v)),
      ],
    );
    return rows.length > 0;
  }

  /**
   * Returns every player address recorded for a round, in join order.
   */
  async getPlayersInRound(roundId: number | string): Promise<string[]> {
    const rows = await this.dataSource.query<{ player: string }[]>(
      `SELECT player
         FROM chain_round_player
        WHERE round_id = $1
        ORDER BY joined_ledger ASC NULLS LAST, id ASC`,
      [String(roundId)],
    );
    return rows.map((r) => r.player);
  }
}
