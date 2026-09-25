import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Share } from './entities/share.entity';
import { NotificationService } from '../../notification/providers/notification.service';
import { ActivityService } from '../activity/activity.service';

@Injectable()
export class ShareNotificationService {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly activityService: ActivityService,
  ) {}

  @OnEvent('share.created')
  async handleShareCreated(share: Share) {
    await this.notifyFollowers(share);
    await this.updateActivityFeed(share);
  }

  @OnEvent('share.viewed')
  async handleShareViewed(payload: { shareId: string, viewerId: string }) {
    await this.notifyContentOwner(payload.shareId, payload.viewerId);
    await this.updateViewActivity(payload.shareId, payload.viewerId);
  }

  private async notifyFollowers(share: Share) {
    const notification = {
      userId: share.userId,
      type: 'new_share',
      message: `New ${share.type} shared!`,
      metadata: {
        shareId: share.id,
        contentType: share.type,
        shareLink: share.shareLink,
      },
    };
    
    await this.notificationService.sendToFollowers(share.userId, notification);
  }

  private async notifyContentOwner(shareId: string, viewerId: string) {
    const notification = {
      userId: viewerId,
      type: 'share_engagement',
      message: 'Someone viewed your shared content!',
      metadata: {
        shareId: shareId,
        viewerId: viewerId,
        viewedAt: new Date(),
      },
    };
    
    await this.notificationService.sendToUser(viewerId, notification);
  }

  private async updateActivityFeed(share: Share) {
    const activityItem = {
      userId: share.userId,
      type: 'share_created',
      metadata: {
        shareId: share.id,
        contentType: share.type,
        shareLink: share.shareLink,
        title: share.title,
      },
    };
    
    await this.activityService.addItem(activityItem);
  }

  private async updateViewActivity(shareId: string, viewerId: string) {
    const activityItem = {
      userId: viewerId,
      type: 'share_viewed',
      metadata: {
        shareId: shareId,
        viewedAt: new Date(),
      },
    };
    
    await this.activityService.addItem(activityItem);
  }
}
