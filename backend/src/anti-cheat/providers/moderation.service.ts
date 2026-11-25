import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModerationStatus, PlayerFlag } from '../entities/player-flag.entity';
import {
  ModerationQueueQueryDto,
  ReviewFlagDto,
} from '../dto/moderation.dto';

/**
 * ModerationService owns the admin moderation queue:
 *   – listing pending (or any-status) flags
 *   – reviewing (approve/hide/ban) a specific flag
 *   – querying the flag status for a specific address (used by the leaderboard
 *     to decide whether to annotate an entry as hidden/under-review)
 */
@Injectable()
export class ModerationService {
  constructor(
    @InjectRepository(PlayerFlag)
    private readonly flagRepository: Repository<PlayerFlag>,
  ) {}

  /**
   * Returns the moderation queue ordered by most-recently created.
   * Defaults to PENDING flags; pass `status` in the query to see other
   * buckets, or omit it to see everything.
   */
  async listFlags(query: ModerationQueueQueryDto): Promise<PlayerFlag[]> {
    const qb = this.flagRepository
      .createQueryBuilder('f')
      .orderBy('f.created_at', 'DESC');

    if (query.status) {
      qb.andWhere('f.status = :status', { status: query.status });
    }
    if (query.address) {
      qb.andWhere('f.address = :address', { address: query.address });
    }

    return qb.getMany();
  }

  /**
   * Applies a moderation decision to a single flag row.
   * `reviewedBy` should be the authenticated admin's address or user ID.
   */
  async reviewFlag(
    flagId: string,
    dto: ReviewFlagDto,
    reviewedBy: string,
  ): Promise<PlayerFlag> {
    const flag = await this.flagRepository.findOneBy({ id: flagId });
    if (!flag) {
      throw new NotFoundException(`Flag ${flagId} not found`);
    }

    flag.status = dto.status;
    flag.reviewerNote = dto.reviewerNote ?? flag.reviewerNote;
    flag.reviewedBy = reviewedBy;

    return this.flagRepository.save(flag);
  }

  /**
   * Returns the most-severe active flag for the given address, or null if
   * none exists.  Used by the leaderboard to annotate entries.
   *
   * Severity order: BANNED > HIDDEN > PENDING > REVIEWED (clear).
   */
  async getAddressStatus(
    address: string,
  ): Promise<ModerationStatus | null> {
    const flags = await this.flagRepository.find({
      where: { address },
      select: ['status'],
    });

    if (!flags.length) return null;

    const statuses = new Set(flags.map((f) => f.status));
    if (statuses.has(ModerationStatus.BANNED)) return ModerationStatus.BANNED;
    if (statuses.has(ModerationStatus.HIDDEN)) return ModerationStatus.HIDDEN;
    if (statuses.has(ModerationStatus.PENDING)) return ModerationStatus.PENDING;
    return ModerationStatus.REVIEWED; // all reviewed → effectively clear
  }

  /**
   * Returns true when the given address has at least one HIDDEN or BANNED
   * flag — used to suppress the entry from public leaderboard responses.
   */
  async isSuppressed(address: string): Promise<boolean> {
    const status = await this.getAddressStatus(address);
    return (
      status === ModerationStatus.HIDDEN ||
      status === ModerationStatus.BANNED
    );
  }
}
