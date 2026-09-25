import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { CreateNotificationDto } from '../dto/create-notification.dto';

/** Emitted after a notification is stored; `NotificationGateway` pushes it to the user. */
export const NOTIFICATION_CREATED = 'notification.created';

@Injectable()
export class NotificationService {
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
}
