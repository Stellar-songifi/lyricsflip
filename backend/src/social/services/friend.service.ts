// services/friend.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Friend } from '../entities/friend.entity';
import { NotificationService } from '../../notification/providers/notification.service';
import { NotificationType } from '../../notification/enums/notification-type.enum';

@Injectable()
export class FriendService {
  constructor(
    @InjectRepository(Friend)
    private friendRepository: Repository<Friend>,
    private notificationService: NotificationService,
  ) {}

  async sendFriendRequest(senderId: string, receiverId: string) {
    const request = this.friendRepository.create({
      senderId,
      receiverId,
      status: FriendStatus.PENDING,
    });

    await this.friendRepository.save(request);

    await this.notificationService.sendToUser(receiverId, {
      type: NotificationType.FRIEND_REQUEST,
      message: 'You have a new friend request',
      metadata: { senderId },
    });

    return request;
  }

  async acceptFriendRequest(userId: string, requestId: string) {
    const request = await this.friendRepository.findOne(requestId);
    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.receiverId !== userId) {
      throw new ForbiddenException('Cannot accept this friend request');
    }

    request.status = FriendStatus.ACCEPTED;
    return this.friendRepository.save(request);
  }

  async getFriends(userId: string) {
    return this.friendRepository.find({
      where: [
        { senderId: userId, status: FriendStatus.ACCEPTED },
        { receiverId: userId, status: FriendStatus.ACCEPTED },
      ],
      relations: ['profile'],
    });
  }
}