import { Test, TestingModule } from '@nestjs/testing';
import { NotificationController } from './notification.controller';
import { NotificationService } from './providers/notification.service';

describe('NotificationController', () => {
  let controller: NotificationController;
  const service = { findForUser: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [{ provide: NotificationService, useValue: service }],
    }).compile();

    controller = module.get(NotificationController);
  });

  it("returns the current user's notifications", () => {
    controller.getNotifications('user-1', true);
    expect(service.findForUser).toHaveBeenCalledWith('user-1', true);
  });

  it('marks notifications as read for the current user', () => {
    controller.markRead('user-1', 'n-1');
    controller.markAllRead('user-1');
    expect(service.markRead).toHaveBeenCalledWith('user-1', 'n-1');
    expect(service.markAllRead).toHaveBeenCalledWith('user-1');
  });
});
