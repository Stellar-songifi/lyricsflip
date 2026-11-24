import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource, MoreThanOrEqual } from 'typeorm';
import { Referral, ReferralStatus } from '../social/entities/referral.entity';
import { ReferralCredit } from './entities/referral-credit.entity';
import { User } from '../user/user.entity';
import {
  IndexerDomainEvents,
  RoundCompletedEvent,
} from '../indexer/services/indexer.service';
import { ChainRoundPlayer } from '../indexer/entities/indexer-state.entity';

/** Emitted by UserService.findOrCreateByStellarAddress when a new wallet signs up with a code. */
export interface ReferralSignupEvent {
  newUserId: string;
  referralCode: string;
}

/**
 * Minimum number of on-chain players in a finalized round for it to count as
 * a qualifying "multiplayer" round (LF-355 acceptance criterion).
 */
const MIN_PLAYERS_FOR_QUALIFICATION = 2;

/**
 * ReferralService (LF-355)
 * -------------------------
 * Handles the full referral-reward lifecycle:
 *
 *  1. On wallet sign-up (`referral.signup` event): link the new user to the
 *     referrer who owns the supplied code by creating a PENDING Referral row.
 *
 *  2. On round completion (`round.completed` event from the indexer):
 *     - Skip solo rounds (< 2 players).
 *     - For every player in the round, look up whether they have a PENDING
 *       referral whose first qualifying round has not yet been recorded.
 *     - Run anti-abuse checks:
 *         a. Minimum account age: referee's joinedLedger must be at least
 *            REFERRAL_MIN_ACCOUNT_AGE_LEDGERS older than their first-round
 *            ledger (default 100 ledgers ≈ 8 minutes on Stellar mainnet).
 *         b. Daily cap: referrer must not have already received
 *            REFERRAL_MAX_CREDITS_PER_DAY credits today (default 10).
 *         c. Self-referral via second wallet: if the referrer played in the
 *            same round as the referee, the credit is rejected.
 *     - Mark the referral COMPLETED, issue points to the referrer, and write
 *       an idempotent ReferralCredit audit row.
 */
@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  /** Points credited to the referrer when a qualifying round completes. */
  private readonly rewardPoints: number;

  /** Minimum ledger age for the referee's account (anti-sybil). */
  private readonly minAccountAgeLedgers: number;

  /** Maximum credits a single referrer may receive per UTC calendar day. */
  private readonly maxCreditsPerDay: number;

  constructor(
    @InjectRepository(Referral)
    private readonly referralRepo: Repository<Referral>,

    @InjectRepository(ReferralCredit)
    private readonly creditRepo: Repository<ReferralCredit>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(ChainRoundPlayer)
    private readonly roundPlayerRepo: Repository<ChainRoundPlayer>,

    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    this.rewardPoints =
      this.configService.get<number>('referral.rewardPoints') ?? 50;
    this.minAccountAgeLedgers =
      this.configService.get<number>('referral.minAccountAgeLedgers') ?? 100;
    this.maxCreditsPerDay =
      this.configService.get<number>('referral.maxCreditsPerDay') ?? 10;
  }

  // ---------------------------------------------------------------------------
  // 1. Sign-up hook: link new user to referrer
  // ---------------------------------------------------------------------------

  /**
   * Called when a new wallet user signs up with a referral code.
   * Creates a PENDING Referral row and stores the code on the new user.
   * Idempotent: if the referral already exists (e.g. event replay) it is a
   * no-op.
   */
  @OnEvent('referral.signup')
  async handleReferralSignup(event: ReferralSignupEvent): Promise<void> {
    const { newUserId, referralCode } = event;
    this.logger.log(
      `Received referral.signup for user=${newUserId} code=${referralCode}`,
    );

    try {
      // Find the referrer who owns this code.
      const referrer = await this.userRepo.findOne({
        where: { referralCode },
      });

      if (!referrer) {
        this.logger.warn(
          `Referral code "${referralCode}" not found — ignoring signup for user=${newUserId}`,
        );
        return;
      }

      // Self-referral guard: a user cannot refer themselves.
      if (referrer.id === newUserId) {
        this.logger.warn(
          `Self-referral attempt: user=${newUserId} supplied their own code`,
        );
        return;
      }

      // Idempotency: skip if the referral already exists.
      const existing = await this.referralRepo.findOne({
        where: { refereeId: newUserId },
      });
      if (existing) {
        this.logger.debug(
          `Referral already exists for referee=${newUserId} — skipping`,
        );
        return;
      }

      await this.referralRepo.save(
        this.referralRepo.create({
          referralCode,
          referrerId: referrer.id,
          refereeId: newUserId,
          status: ReferralStatus.PENDING,
        }),
      );

      this.logger.log(
        `Created PENDING referral: referrer=${referrer.id} referee=${newUserId}`,
      );
    } catch (err) {
      this.logger.error(
        `handleReferralSignup error for user=${newUserId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Round-completion hook: award referrer on first qualifying round
  // ---------------------------------------------------------------------------

  @OnEvent(IndexerDomainEvents.ROUND_COMPLETED)
  async handleRoundCompleted(event: RoundCompletedEvent): Promise<void> {
    const { roundId, results } = event;

    // Only qualify multiplayer rounds.
    if (results.length < MIN_PLAYERS_FOR_QUALIFICATION) {
      return;
    }

    this.logger.debug(
      `Processing referral rewards for round=${roundId} players=${results.length}`,
    );

    // All stellar addresses in this round (used for the same-round self-referral check).
    const addressesInRound = new Set(results.map((r) => r.playerId));

    for (const result of results) {
      await this.maybeAwardReferral(roundId, result.playerId, addressesInRound);
    }
  }

  // ---------------------------------------------------------------------------
  // Core award logic (one candidate at a time)
  // ---------------------------------------------------------------------------

  private async maybeAwardReferral(
    roundId: string,
    refereeAddress: string,
    addressesInRound: Set<string>,
  ): Promise<void> {
    // Resolve stellar address → User.
    const referee = await this.userRepo.findOne({
      where: { stellarAddress: refereeAddress },
    });
    if (!referee) return;

    // Find a PENDING referral for this user whose first round has not been set.
    const referral = await this.referralRepo.findOne({
      where: {
        refereeId: referee.id,
        status: ReferralStatus.PENDING,
        firstRoundId: null as any,
      },
    });
    if (!referral) return;

    // Fetch the referee's joinedLedger from the chain data for this round.
    const roundPlayerRow = await this.roundPlayerRepo.findOne({
      where: { roundId, player: refereeAddress },
    });
    const joinedLedger = roundPlayerRow?.joinedLedger ?? null;

    // ---- Anti-abuse check A: minimum account age ----
    if (joinedLedger !== null) {
      const ageCheck = await this.isAccountOldEnough(
        refereeAddress,
        joinedLedger,
      );
      if (!ageCheck) {
        this.logger.warn(
          `Referral rejected (account too young): referee=${refereeAddress} joined_ledger=${joinedLedger}`,
        );
        return;
      }
    }

    // ---- Anti-abuse check B: same-round self-referral ----
    const referrer = await this.userRepo.findOne({
      where: { id: referral.referrerId },
    });
    if (!referrer) return;

    if (
      referrer.stellarAddress &&
      addressesInRound.has(referrer.stellarAddress)
    ) {
      this.logger.warn(
        `Referral rejected (same-round self-referral): referrer=${referrer.stellarAddress} was in round=${roundId}`,
      );
      return;
    }

    // ---- Anti-abuse check C: daily cap ----
    const withinCap = await this.isWithinDailyCap(referral.referrerId);
    if (!withinCap) {
      this.logger.warn(
        `Referral rejected (daily cap reached): referrer=${referral.referrerId}`,
      );
      return;
    }

    // ---- Issue the reward inside a single transaction ----
    await this.issueReward(referral, referee, referrer, roundId, joinedLedger);
  }

  // ---------------------------------------------------------------------------
  // Anti-abuse helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns true when the referee's account first appeared on-chain at least
   * `minAccountAgeLedgers` before the qualifying round's joinedLedger.
   *
   * We use the earliest joinedLedger for this address across ALL rounds as a
   * proxy for "account creation ledger", since the backend has no Horizon
   * client.  An account that was created specifically to game the referral
   * system will show a small age delta.
   */
  private async isAccountOldEnough(
    refereeAddress: string,
    thisRoundJoinedLedger: number,
  ): Promise<boolean> {
    if (this.minAccountAgeLedgers <= 0) return true;

    // Earliest ledger this address has ever appeared in a round.
    const earliest = await this.roundPlayerRepo
      .createQueryBuilder('rp')
      .select('MIN(rp.joinedLedger)', 'minLedger')
      .where('rp.player = :addr', { addr: refereeAddress })
      .getRawOne<{ minLedger: string | null }>();

    const minLedger = earliest?.minLedger ? Number(earliest.minLedger) : null;
    if (minLedger === null) return true; // No prior data — give benefit of doubt.

    const age = thisRoundJoinedLedger - minLedger;
    return age >= this.minAccountAgeLedgers;
  }

  /**
   * Returns true when the referrer has received fewer than
   * `maxCreditsPerDay` credits in the current UTC calendar day.
   */
  private async isWithinDailyCap(referrerId: string): Promise<boolean> {
    if (this.maxCreditsPerDay <= 0) return true;

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const count = await this.creditRepo.count({
      where: {
        referrerId,
        creditedAt: MoreThanOrEqual(startOfDay),
      },
    });

    return count < this.maxCreditsPerDay;
  }

  // ---------------------------------------------------------------------------
  // Reward issuance (transactional)
  // ---------------------------------------------------------------------------

  private async issueReward(
    referral: Referral,
    referee: User,
    referrer: User,
    roundId: string,
    joinedLedger: number | null,
  ): Promise<void> {
    const now = new Date();

    await this.dataSource.transaction(async (manager) => {
      // 1. Mark the referral as completed.
      await manager.update(Referral, referral.id, {
        status: ReferralStatus.COMPLETED,
        completedAt: now,
        firstRoundId: roundId,
        refereeJoinedLedger: joinedLedger,
        isRewardDistributed: true,
        rewardDetails: {
          type: 'points',
          amount: this.rewardPoints,
          status: 'distributed',
          distributedAt: now,
        },
      });

      // 2. Credit points to the referrer.
      await manager.increment(User, { id: referrer.id }, 'points', this.rewardPoints);

      // 3. Update referrer's referralStats.
      const updatedReferrer = await manager.findOneOrFail(User, {
        where: { id: referrer.id },
      });
      const stats = updatedReferrer.referralStats ?? {
        totalReferrals: 0,
        successfulReferrals: 0,
        pendingReferrals: 0,
        totalRewardsEarned: 0,
      };
      await manager.update(User, referrer.id, {
        referralStats: {
          ...stats,
          successfulReferrals: (stats.successfulReferrals ?? 0) + 1,
          pendingReferrals: Math.max(0, (stats.pendingReferrals ?? 0) - 1),
          totalRewardsEarned: (stats.totalRewardsEarned ?? 0) + this.rewardPoints,
        },
      });

      // 4. Write idempotent audit row (unique index prevents double-issuing).
      const credit = manager.create(ReferralCredit, {
        referrerId: referrer.id,
        refereeId: referee.id,
        roundId,
        pointsAwarded: this.rewardPoints,
        creditedAt: now,
      });
      await manager.save(ReferralCredit, credit);
    });

    this.logger.log(
      `Referral reward issued: referrer=${referrer.id} referee=${referee.id} ` +
        `round=${roundId} points=${this.rewardPoints}`,
    );
  }
}
