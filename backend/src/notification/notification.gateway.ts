import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { WsAuthenticator } from '../auth/providers/ws-authenticator.provider';
import { NotificationService, NOTIFICATION_CREATED } from './providers/notification.service';
import { Notification } from './entities/notification.entity';

const userRoom = (userId: string) => `user:${userId}`;

/**
 * `/notifications` namespace: every server-to-user push (notifications,
 * achievements, progression). Clients connect with `auth: { token }` and are
 * joined to a room for their user id.
 */
@WebSocketGateway({ namespace: 'notifications' })
export class NotificationGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  constructor(
    private readonly wsAuthenticator: WsAuthenticator,
    private readonly notificationService: NotificationService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const user = await this.wsAuthenticator.authenticate(client);
      client.data.user = user;
      await client.join(userRoom(user.sub));
    } catch (error) {
      this.logger.warn(`Rejected socket ${client.id}: ${error.message}`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('markRead')
  markRead(@ConnectedSocket() client: Socket, @MessageBody() notificationId: string) {
    return this.notificationService.markRead(client.data.user.sub, notificationId);
  }

  @OnEvent(NOTIFICATION_CREATED)
  handleNotificationCreated(notification: Notification) {
    this.server.to(userRoom(notification.userId)).emit('notification', notification);
  }

  @OnEvent('achievement.unlocked')
  handleAchievementUnlocked(payload: { userId: string; achievement: unknown; unlockedAt: Date }) {
    this.server.to(userRoom(payload.userId)).emit('achievementUnlocked', {
      achievement: payload.achievement,
      unlockedAt: payload.unlockedAt,
    });
  }

  @OnEvent('progression.xp.added')
  handleXpAdded(payload: { userId: string }) {
    this.server.to(userRoom(payload.userId)).emit('xpGained', payload);
  }

  @OnEvent('progression.level.up')
  handleLevelUp(payload: { userId: string }) {
    this.server.to(userRoom(payload.userId)).emit('levelUp', payload);
  }

  @OnEvent('progression.rank.changed')
  handleRankChange(payload: { userId: string }) {
    this.server.to(userRoom(payload.userId)).emit('rankChanged', payload);
  }
}
