import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from '../entities/notification.entity';
import { CreateNotificationDto } from '../dto/create-notification.dto';

/** Emitted after a notification is stored; `NotificationGateway` pushes it to the user. */
export const NOTIFICATION_CREATED = 'notification.created';

/** Domain events emitted by the indexer. */
export const ROUND_JOINED = 'round.joined';
export const ROUND_STARTED = 'round.started';
export const ROUND_COMPLETED = 'round.completed';
export const REWARD_CLAIMABLE = 'reward.claimable';
export const NFT_MINTED = 'nft.minted';
export const ROUND_CANCELLED = 'round.cancelled';

export interface RoundJoinedEvent {
  roundId: string;
  playerId: string;
  adminId: string;
}

export interface RoundStartedEvent {
  roundId: string;
  playerIds: string[];
}

export interface RoundCompletedEvent {
  roundId: string;
  /** Final ranking, best first. */
  rankings: Array<{ userId: string; position: number }>;
}

export interface RewardClaimableEvent {
  roundId: string;
  userIds: string[];
  amount?: string;
}

export interface NftMintedEvent {
  roundId: string;
  userId: string;
  tokenId?: string;
}

export interface RoundCancelledEvent {
  roundId: string;
  playerIds: string[];
  refunded?: boolean;
}

/** Per-user notification preferences, keyed by notification type. */
export type NotificationPreferences = Partial<Record<NotificationType, boolean>>;

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = await this.notificationRepository.save(
      this.notificationRepository.create({ ...dto, isRead: false }),
    );
    this.eventEmitter.emit(NOTIFICATION_CREATED, notification);
    return notification;
  }

  sendToUser(userId: string, dto: Omit<CreateNotificationDto, 'userId'>): Promise<Notification> {
    return this.create({ ...dto, userId });
  }

  /**
   * Notifies a user's followers. There is no follower graph yet, so this only
   * stores the notification for `dto.userId`.
   */
  async sendToFollowers(userId: string, dto: CreateNotificationDto): Promise<void> {
    await this.create(dto);
  }

  findForUser(userId: string, unreadOnly = false): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: unreadOnly ? { userId, isRead: false } : { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async markRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({ where: { id, userId } });
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

  getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({ where: { userId, isRead: false } });
  }

  /**
   * Resolves the notification preferences for a user. No preferences store
   * exists yet, so every type is enabled by default.
   */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return {};
  }

  private async isEnabled(userId: string, type: NotificationType): Promise<boolean> {
    const preferences = await this.getPreferences(userId);
    return preferences[type] !== false;
  }

  /** Persists a notification for each recipient that has not opted out. */
  private async notifyUsers(
    userIds: string[],
    type: NotificationType,
    build: (userId: string) => Omit<CreateNotificationDto, 'userId' | 'type'>,
  ): Promise<void> {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    await Promise.all(
      uniqueUserIds.map(async (userId) => {
        try {
          if (!(await this.isEnabled(userId, type))) {
            return;
          }
          await this.sendToUser(userId, { ...build(userId), type });
        } catch (error) {
          this.logger.error(
            `Failed to create ${type} notification for user ${userId}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }),
    );
  }

  @OnEvent(ROUND_JOINED)
  async handleRoundJoined(event: RoundJoinedEvent): Promise<void> {
    if (!event.adminId) {
      return;
    }
    await this.notifyUsers([event.adminId], NotificationType.ROUND_JOINED, () => ({
      title: 'Player joined your round',
      message: `A player joined round ${event.roundId}.`,
      data: { roundId: event.roundId, playerId: event.playerId },
    }));
  }

  @OnEvent(ROUND_STARTED)
  async handleRoundStarted(event: RoundStartedEvent): Promise<void> {
    await this.notifyUsers(event.playerIds ?? [], NotificationType.ROUND_STARTED, () => ({
      title: 'Round started',
      message: `Round ${event.roundId} has started. Good luck!`,
      data: { roundId: event.roundId },
    }));
  }

  @OnEvent(ROUND_COMPLETED)
  async handleRoundCompleted(event: RoundCompletedEvent): Promise<void> {
    const rankings = event.rankings ?? [];
    await this.notifyUsers(
      rankings.map((entry) => entry.userId),
      NotificationType.ROUND_COMPLETED,
      (userId) => {
        const position = rankings.find((entry) => entry.userId === userId)?.position;
        const message =
          position === 1
            ? `You won round ${event.roundId}!`
            : `You placed ${position ?? '—'} in round ${event.roundId}.`;
        return {
          title: position === 1 ? 'You won!' : 'Round completed',
          message,
          data: { roundId: event.roundId, position },
        };
      },
    );
  }

  @OnEvent(REWARD_CLAIMABLE)
  async handleRewardClaimable(event: RewardClaimableEvent): Promise<void> {
    await this.notifyUsers(event.userIds ?? [], NotificationType.REWARD_CLAIMABLE, () => ({
      title: 'Reward available',
      message: event.amount
        ? `You can claim ${event.amount} from round ${event.roundId}.`
        : `You have a reward to claim from round ${event.roundId}.`,
      data: { roundId: event.roundId, amount: event.amount },
    }));
  }

  @OnEvent(NFT_MINTED)
  async handleNftMinted(event: NftMintedEvent): Promise<void> {
    await this.notifyUsers([event.userId], NotificationType.NFT_MINTED, () => ({
      title: 'NFT minted',
      message: event.tokenId
        ? `Your NFT #${event.tokenId} from round ${event.roundId} has been minted.`
        : `Your NFT from round ${event.roundId} has been minted.`,
      data: { roundId: event.roundId, tokenId: event.tokenId },
    }));
  }

  @OnEvent(ROUND_CANCELLED)
  async handleRoundCancelled(event: RoundCancelledEvent): Promise<void> {
    await this.notifyUsers(event.playerIds ?? [], NotificationType.ROUND_CANCELLED, () => ({
      title: 'Round cancelled',
      message: event.refunded
        ? `Round ${event.roundId} was cancelled and your entry has been refunded.`
        : `Round ${event.roundId} was cancelled.`,
      data: { roundId: event.roundId, refunded: event.refunded ?? false },
    }));
  }
}
