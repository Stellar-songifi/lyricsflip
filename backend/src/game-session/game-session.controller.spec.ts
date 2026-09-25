import { Test, TestingModule } from '@nestjs/testing';
import { GameSessionController } from './game-session.controller';
import { GameSessionService } from './providers/game-session.service';
import { AccessTokenGuard } from '../auth/guard/access-token/access-token.guard';

describe('GameSessionController', () => {
  let controller: GameSessionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GameSessionController],
      providers: [{ provide: GameSessionService, useValue: { findOne: jest.fn() } }],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GameSessionController>(GameSessionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
