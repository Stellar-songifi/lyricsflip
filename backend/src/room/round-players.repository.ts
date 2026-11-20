import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RoundPlayer } from './entities/round-player.entity';

@Injectable()
export class RoundPlayersRepository {
  constructor(
    @InjectRepository(RoundPlayer)
    private readonly repo: Repository<RoundPlayer>,
  ) {}

  async upsertPlayer(roundId: string, playerId: string): Promise<RoundPlayer> {
    const existing = await this.repo.findOne({ where: { roundId, playerId } });
    if (existing) return existing;
    return this.repo.save(
      this.repo.create({ roundId, playerId, isActive: true }),
    );
  }

  async findByRound(roundId: string): Promise<RoundPlayer[]> {
    return this.repo.find({ where: { roundId } });
  }

  async removePlayer(roundId: string, playerId: string): Promise<void> {
    await this.repo.update({ roundId, playerId }, { isActive: false });
  }

  async isPlayerInRound(
    roundId: string,
    address?: string,
    userId?: string,
  ): Promise<boolean> {
    const playerIds = [address, userId].filter((playerId): playerId is string =>
      Boolean(playerId),
    );
    if (playerIds.length === 0) return false;

    const count = await this.repo.count({
      where: { roundId, playerId: In(playerIds), isActive: true },
    });
    return count > 0;
  }
}
