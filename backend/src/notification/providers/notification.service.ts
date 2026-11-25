import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { NotificationType } from '../enums/notification-type.enum';
import {
  NotificationPreference,
  NotificationChannel,
  PreferenceMap,
} from '../entities/notification-preference.entity';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { UpdatePreferenceDto } from '../dto/update-preferences.dto';
import { MailService } from '../../mail/mail.service';

/** Emitted after a notification is stored; `NotificationGateway` pushes it to the user. */
export const NOTIFICATION_CREATED = 'notification.created';

// ── Indexer domain-event names ─────────────────────────────────────────────
export const ROUND_JOINED    = 'round.joined';
export const ROUND_STARTED   = 'round.started';
export const ROUND_COMPLETED = 'round.completed';
export const REWARD_CLAIMABLE = 'reward.claimable';
export const NFT_MINTED      = 'nft.minted';
export const ROUND_CANCELLED  = 'round.cancelled';

// ── Indexer event payload interfaces ──────────────────────────────────────
// These mirror the shapes emitted by IndexerService exactly.

export interface RoundJoinedEvent {
  roundId: string;
  /** Round owner who should be notified. */
  adminId: string;
  playerId: string;
  playerAddress?: string;
}

export interface RoundStartedEvent {
  roundId: string;
  /** All player user-IDs participating in this round. */
  playerIds: string[];
  timestamp?: Date;
}

export interface RoundCompletedPlayerResult {
  playerId: string;
  won: boolean;
  placement: number | null;
  score?: number;
}

export interface RoundCompletedEvent {
  roundId: string;
  /** One entry per player, in finishing order. */
  results: RoundCompletedPlayerResult[];
}

export interface RewardClaimableEvent {
  roundId: string;
  /** Single winning player (as emitted by the indexer). */
  playerId: string;
  amount: string;
  asset?: string;
}

export interface NftMintedEvent {
  /** Single player who received the NFT. */
  playerId: string;
  nftId: string;
  roundId?: string;
}

export interface RoundCancelledEvent {
  roundId: string;
  playerIds: string[];
  refunds?: Record<string, string>;
  reason?: string;
}

// ── Internal helper type ───────────────────────────────────────────────────

/**
 * Tracks a pending reward so the scheduler can fire the 24-hour unclaimed
 * email.  Stored in-memory; a persistent store can replace this later.
 */
interface PendingReward {
  roundId: string;
  playerId: string;
  amount: string;
  asset: string;
  claimableAt: Date;
  emailedAt: Date | null;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  /**
   * In-memory ledger of unconfirmed reward-claimable events, keyed by
   * `${roundId}:${playerId}`.  The 24-hour scheduler scans this map and
   * sends one reminder email per entry that has gone unclaimed long enough.
   */
  private readonly pendingRewards = new Map<string, PendingReward>();

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepository: Repository<NotificationPreference>,
    private readonly eventEmitter: EventEmitter2,
    private readonly mailService: MailService,
  ) {}

  // ── Core create / query ────────────────────────────────────────────────────

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = await this.notificationRepository.save(
      this.notificationRepository.create({ ...dto, isRead: false }),
    );
    this.eventEmitter.emit(NOTIFICATION_CREATED, notification);
    return notification;
  }

  sendToUser(
    userId: string,
    dto: Omit<CreateNotificationDto, 'userId'>,
  ): Promise<Notification> {
    return this.create({ ...dto, userId });
  }

  findForUser(userId: string, unreadOnly = false): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: unreadOnly ? { userId, isRead: false } : { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async markRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    notification.isRead = true;
    return this.notificationRepository.save(notification);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
    return { updated: result.affected ?? 0 };
  }

  /** Alias kept for backward compatibility with the controller. */
  countUnread(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, isRead: false },
    });
  }

  // ── Opt-out preferences ───────────────────────────────────────────────────

  /**
   * Returns a nested map of `{ [type]: { [channel]: boolean } }`.
   * Missing entries default to `true` (enabled).
   */
  async getPreferences(userId: string): Promise<PreferenceMap> {
    const rows = await this.preferenceRepository.find({ where: { userId } });
    const map: PreferenceMap = {};
    for (const row of rows) {
      const type = row.type as NotificationType;
      if (!map[type]) map[type] = {};
      map[type]![row.channel as NotificationChannel] = row.enabled;
    }
    return map;
  }

  /**
   * Upserts a single type+channel preference for the user.
   * Returns the updated preference row.
   */
  async updatePreference(
    userId: string,
    dto: UpdatePreferenceDto,
  ): Promise<NotificationPreference> {
    let pref = await this.preferenceRepository.findOne({
      where: { userId, type: dto.type, channel: dto.channel },
    });
    if (pref) {
      pref.enabled = dto.enabled;
    } else {
      pref = this.preferenceRepository.create({
        userId,
        type: dto.type,
        channel: dto.channel,
        enabled: dto.enabled,
      });
    }
    return this.preferenceRepository.save(pref);
  }

  /**
   * Returns `true` when the user has NOT opted out of this type+channel.
   * Absent row = enabled by default.
   */
  async isEnabled(
    userId: string,
    type: NotificationType,
    channel: NotificationChannel = NotificationChannel.IN_APP,
  ): Promise<boolean> {
    const pref = await this.preferenceRepository.findOne({
      where: { userId, type, channel },
    });
    return pref ? pref.enabled : true;
  }

  // ── Batch helper ──────────────────────────────────────────────────────────

  /**
   * Persists a notification for each recipient that has not opted out of
   * the in-app channel.  Each failure is caught and logged without aborting
   * the remaining deliveries.
   */
  private async notifyUsers(
    userIds: string[],
    type: NotificationType,
    build: (userId: string) => Omit<CreateNotificationDto, 'userId' | 'type'>,
  ): Promise<void> {
    const unique = [...new Set(userIds.filter(Boolean))];
    await Promise.all(
      unique.map(async (userId) => {
        try {
          if (!(await this.isEnabled(userId, type, NotificationChannel.IN_APP))) {
            return;
          }
          await this.sendToUser(userId, { ...build(userId), type });
        } catch (err) {
          this.logger.error(
            `Failed to create ${type} notification for user ${userId}`,
            err instanceof Error ? err.stack : undefined,
          );
        }
      }),
    );
  }

  // ── Indexer event handlers ────────────────────────────────────────────────

  @OnEvent(ROUND_JOINED)
  async handleRoundJoined(event: RoundJoinedEvent): Promise<void> {
    if (!event.adminId) return;
    await this.notifyUsers([event.adminId], NotificationType.ROUND_JOINED, () => ({
      title: 'Player joined your round',
      message: `A player joined round ${event.roundId}.`,
      metadata: { roundId: event.roundId, playerId: event.playerId },
    }));
  }

  @OnEvent(ROUND_STARTED)
  async handleRoundStarted(event: RoundStartedEvent): Promise<void> {
    await this.notifyUsers(
      event.playerIds ?? [],
      NotificationType.ROUND_STARTED,
      () => ({
        title: 'Your round has started',
        message: `Round ${event.roundId} has started. Good luck!`,
        metadata: { roundId: event.roundId },
      }),
    );
  }

  /**
   * Handles RoundCompleted from the indexer.
   *
   * Indexer shape: `results: [{ playerId, won, placement, score? }]`
   */
  @OnEvent(ROUND_COMPLETED)
  async handleRoundCompleted(event: RoundCompletedEvent): Promise<void> {
    const results = event.results ?? [];
    await this.notifyUsers(
      results.map((r) => r.playerId),
      NotificationType.ROUND_COMPLETED,
      (userId) => {
        const result = results.find((r) => r.playerId === userId);
        const placement = result?.placement ?? null;
        const won = result?.won ?? placement === 1;
        return {
          title: won ? 'You won!' : 'Round completed',
          message: won
            ? `You won round ${event.roundId}! Claim your reward.`
            : `You placed ${placement ?? '—'} in round ${event.roundId}.`,
          metadata: { roundId: event.roundId, placement, won },
        };
      },
    );
  }

  /**
   * Handles RewardClaimable from the indexer.
   *
   * Indexer shape: `{ roundId, playerId, amount, asset? }` (singular player).
   */
  @OnEvent(REWARD_CLAIMABLE)
  async handleRewardClaimable(event: RewardClaimableEvent): Promise<void> {
    const { roundId, playerId, amount, asset = 'XLM' } = event;

    await this.notifyUsers([playerId], NotificationType.REWARD_CLAIMABLE, () => ({
      title: 'Reward available to claim',
      message: `You can claim ${amount} ${asset} from round ${roundId}.`,
      metadata: { roundId, amount, asset },
    }));

    // Track for the 24-hour unclaimed-reward email reminder.
    const key = `${roundId}:${playerId}`;
    this.pendingRewards.set(key, {
      roundId,
      playerId,
      amount,
      asset,
      claimableAt: new Date(),
      emailedAt: null,
    });
  }

  /**
   * Handles NftMinted from the indexer.
   *
   * Indexer shape: `{ playerId, nftId, roundId? }`.
   */
  @OnEvent(NFT_MINTED)
  async handleNftMinted(event: NftMintedEvent): Promise<void> {
    await this.notifyUsers([event.playerId], NotificationType.NFT_MINTED, () => ({
      title: 'New badge minted',
      message: event.roundId
        ? `Your NFT #${event.nftId} from round ${event.roundId} has been minted.`
        : `Your NFT #${event.nftId} has been minted.`,
      metadata: { nftId: event.nftId, roundId: event.roundId ?? null },
    }));
  }

  @OnEvent(ROUND_CANCELLED)
  async handleRoundCancelled(event: RoundCancelledEvent): Promise<void> {
    await this.notifyUsers(
      event.playerIds ?? [],
      NotificationType.ROUND_CANCELLED,
      (userId) => {
        const refund = event.refunds?.[userId];
        return {
          title: 'Round cancelled',
          message: refund
            ? `Round ${event.roundId} was cancelled. ${refund} has been refunded.`
            : `Round ${event.roundId} was cancelled.`,
          metadata: {
            roundId: event.roundId,
            refunded: !!refund,
            refundAmount: refund ?? null,
            reason: event.reason ?? null,
          },
        };
      },
    );
  }

  // ── 24-hour unclaimed-reward email ────────────────────────────────────────

  /**
   * Runs every hour and sends one reminder email per pending reward that
   * has gone unclaimed for more than 24 hours and hasn't been emailed yet.
   *
   * The in-memory map is sufficient for now — the worst case of a process
   * restart is that the email is re-sent on the next restart cycle, which
   * is acceptable.  A persistent `reward_reminders` table can replace this
   * when the system handles high volume.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sendUnclaimedRewardReminders(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const [key, reward] of this.pendingRewards) {
      if (reward.emailedAt !== null || reward.claimableAt > cutoff) {
        continue;
      }

      try {
        const enabled = await this.isEnabled(
          reward.playerId,
          NotificationType.REWARD_CLAIMABLE,
          NotificationChannel.EMAIL,
        );
        if (!enabled) {
          this.pendingRewards.delete(key);
          continue;
        }

        // Look up the user's email address.  Users registered via wallet
        // may have no email — skip silently in that case.
        const email = await this.resolveUserEmail(reward.playerId);
        if (!email) {
          this.pendingRewards.delete(key);
          continue;
        }

        await this.mailService.send(email, 'winningsUnclaimed', {
          roundId: reward.roundId,
          amount: reward.amount,
          asset: reward.asset,
          claimUrl: `${this.mailService.appUrl}/rounds/${reward.roundId}/claim`,
        });

        reward.emailedAt = new Date();
        this.logger.log(
          `Sent unclaimed-reward reminder to user ${reward.playerId} for round ${reward.roundId}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to send unclaimed-reward email for ${key}`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }
  }

  /**
   * Removes a reward from the pending map once it has been claimed.
   * Call this from the wager/claim flow when a player claims their reward.
   */
  markRewardClaimed(roundId: string, playerId: string): void {
    this.pendingRewards.delete(`${roundId}:${playerId}`);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Looks up a user's email via the user repository.  Returns null if the
   * user does not exist or has no email (wallet-only account).
   *
   * Injected lazily via the TypeORM connection so we avoid a circular
   * dependency with UserModule.
   */
  private async resolveUserEmail(userId: string): Promise<string | null> {
    try {
      const repo = this.notificationRepository.manager.getRepository('users');
      const user = await repo.findOne({ where: { id: userId } });
      return (user as any)?.email ?? null;
    } catch {
      return null;
    }
  }
}
