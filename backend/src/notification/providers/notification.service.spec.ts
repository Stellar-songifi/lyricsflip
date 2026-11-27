import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import {
  NotificationService,
  NOTIFICATION_CREATED,
} from './notification.service';
import { Notification } from '../entities/notification.entity';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { MailService } from '../../mail/mail.service';

describe('NotificationService', () => {
  let service: NotificationService;

  const repository = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ id: 'n-1', ...data })),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const eventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: getRepositoryToken(Notification), useValue: repository },
        {
          provide: getRepositoryToken(NotificationPreference),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            find: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: EventEmitter2, useValue: eventEmitter },
        {
          provide: MailService,
          useValue: { sendNotificationEmail: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(NotificationService);
  });

  it('stores an unread notification and emits it for the gateway', async () => {
    const notification = await service.sendToUser('user-1', {
      type: 'info',
      title: 'Hi',
      message: 'hi',
    });

    expect(notification).toMatchObject({
      id: 'n-1',
      userId: 'user-1',
      isRead: false,
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      NOTIFICATION_CREATED,
      notification,
    );
  });

  it('filters to unread notifications when asked', async () => {
    await service.findForUser('user-1', true);
    expect(repository.find).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
      order: { createdAt: 'DESC' },
    });
  });

  it("only marks the owner's notification as read", async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.markRead('user-2', 'n-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'n-1', userId: 'user-2' },
    });
  });

  it('marks all unread notifications as read', async () => {
    repository.update.mockResolvedValue({ affected: 3 });
    await expect(service.markAllRead('user-1')).resolves.toEqual({
      updated: 3,
    });
    expect(repository.update).toHaveBeenCalledWith(
      { userId: 'user-1', isRead: false },
      { isRead: true },
    );
  });
});
