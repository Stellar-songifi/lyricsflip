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
   * LF-340: Sums the amount of every wager still in escrow (status =
   * ESCROWED), grouped by asset. Used by the nightly reconciliation job to
   * compare the database's open pots against the escrow contract's actual
   * on-chain token balance.
   */
  async sumEscrowedAmounts(): Promise<Record<string, string>> {
    const rows = await this.wagerRepository
      .createQueryBuilder('wager')
      .select('wager.asset', 'asset')
      .addSelect('COALESCE(SUM(wager.amount), 0)', 'total')
      .where('wager.status = :status', { status: WagerStatus.ESCROWED })
      .groupBy('wager.asset')
      .getRawMany<{ asset: string; total: string }>();

    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.asset] = row.total;
    }
    return result;
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
