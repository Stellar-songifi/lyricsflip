import { Test, TestingModule } from '@nestjs/testing';
import { GameResultsController } from './game-results.controller';
import { GameResultsService } from './game-results.service';

describe('GameResultsController', () => {
  let controller: GameResultsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GameResultsController],
      providers: [{ provide: GameResultsService, useValue: {} }],
    }).compile();

    controller = module.get<GameResultsController>(GameResultsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
