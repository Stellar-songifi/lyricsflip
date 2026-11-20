import { Test, TestingModule } from '@nestjs/testing';
import { WagerController, RoundWagerController } from './wager.controller';
import { WagerService } from './provider/wager.service';

describe('WagerController', () => {
  let controller: WagerController;
  let service: jest.Mocked<WagerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WagerController],
      providers: [
        {
          provide: WagerService,
          useValue: { findByPlayer: jest.fn(), findByRound: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<WagerController>(WagerController);
    service = module.get(WagerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getMyWagers delegates to the service with the current user and pagination', async () => {
    (service.findByPlayer as jest.Mock).mockResolvedValue({ data: [] });

    await controller.getMyWagers('user-1', 2, 10);

    expect(service.findByPlayer).toHaveBeenCalledWith('user-1', {
      page: 2,
      limit: 10,
    });
  });
});

describe('RoundWagerController', () => {
  let controller: RoundWagerController;
  let service: jest.Mocked<WagerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoundWagerController],
      providers: [
        { provide: WagerService, useValue: { findByRound: jest.fn() } },
      ],
    }).compile();

    controller = module.get<RoundWagerController>(RoundWagerController);
    service = module.get(WagerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getRoundWagers delegates to the service with the round id', async () => {
    (service.findByRound as jest.Mock).mockResolvedValue([]);

    await controller.getRoundWagers('42');

    expect(service.findByRound).toHaveBeenCalledWith('42');
  });
});
