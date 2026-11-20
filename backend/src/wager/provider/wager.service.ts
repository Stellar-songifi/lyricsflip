import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wager, WagerStatus } from '../entities/wager.entity';

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ChainWagerEvent {
  roundId: string;
  player: string;
  amount: string;
  asset?: string;
  txHash?: string | null;
  status: WagerStatus;
}

// Service responsible for reading indexed wager data. Wagers themselves are
// placed and claimed by the player's wallet on-chain (see LF-087); the
// backend only reads and indexes what the contract already did.
@Injectable()
export class WagerService {
  constructor(
    @InjectRepository(Wager)
    private readonly wagerRepository: Repository<Wager>,
  ) {}

  // Paginated wager history for a single player, most recent first.
  async findByPlayer(
    player: string,
    { page, limit }: PaginationOptions,
  ): Promise<PaginatedResult<Wager>> {
    const [data, total] = await this.wagerRepository.findAndCount({
      where: { player },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  // All wagers placed on a given round.
  async findByRound(roundId: string): Promise<Wager[]> {
    return this.wagerRepository.find({
      where: { roundId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Upserts a wager row from an indexed on-chain event (`RoundJoined`,
   * `RoundCompleted`, `RoundCancelled`). Intended to be called by the
   * indexer (LF-088) as it decodes events — not exposed over HTTP.
   */
  async upsertFromChainEvent(event: ChainWagerEvent): Promise<Wager> {
    let wager = await this.wagerRepository.findOne({
      where: { roundId: event.roundId, player: event.player },
    });

    if (!wager) {
      wager = this.wagerRepository.create({
        roundId: event.roundId,
        player: event.player,
        amount: event.amount,
        asset: event.asset ?? 'native',
      });
    } else {
      wager.amount = event.amount;
      if (event.asset) wager.asset = event.asset;
    }

    wager.status = event.status;
    if (event.txHash) wager.txHash = event.txHash;

    return this.wagerRepository.save(wager);
  }
}
