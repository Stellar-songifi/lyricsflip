import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChainRound } from '../entities/chain-round.entity';

/**
 * Maintains the lifecycle of on-chain rounds: creation, state transitions,
 * and expiry detection. Consumed by IndexerService when it processes
 * round-related events from the Stellar RPC feed.
 */
@Injectable()
export class RoundKeeperService {
  private readonly logger = new Logger(RoundKeeperService.name);

  constructor(
    @InjectRepository(ChainRound)
    private readonly roundRepo: Repository<ChainRound>,
  ) {}

  async upsertRound(
    roundId: string,
    patch: Partial<ChainRound>,
  ): Promise<ChainRound> {
    const existing = await this.roundRepo.findOne({ where: { id: roundId } });
    if (existing) {
      return this.roundRepo.save({ ...existing, ...patch });
    }
    return this.roundRepo.save(
      this.roundRepo.create({ id: roundId, ...patch }),
    );
  }

  async findRound(roundId: string): Promise<ChainRound | null> {
    return this.roundRepo.findOne({ where: { id: roundId } });
  }

  async closeRound(roundId: string): Promise<void> {
    await this.roundRepo.update(roundId, { status: 'closed' });
    this.logger.log(`Round ${roundId} closed`);
  }
}
