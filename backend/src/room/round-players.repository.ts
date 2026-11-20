import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class RoundPlayersRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async isPlayerInRound(
    roundId: number | string,
    address?: string,
    userId?: string,
  ): Promise<boolean> {
    if (!address && !userId) return false;

    const rows = await this.dataSource.query(
      'SELECT 1 FROM chain_round_player WHERE round_id = $1 AND (player_address = $2 OR player_id = $3) LIMIT 1',
      [String(roundId), address ?? null, userId ?? null],
    );
    return rows.length > 0;
  }
}
