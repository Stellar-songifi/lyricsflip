import { Test, TestingModule } from '@nestjs/testing';
import { FriendController } from '../controllers/friend.controller';
import { FriendService } from '../services/friend.service';

describe('FriendController', () => {
  let controller: FriendController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FriendController],
      providers: [{ provide: FriendService, useValue: {} }],
    }).compile();

    controller = module.get<FriendController>(FriendController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
