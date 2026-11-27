import { Test, TestingModule } from '@nestjs/testing';
import { ScoringController } from './scoring.controller';
import { ScoringService } from './scoring.service';

describe('ScoringController', () => {
  let controller: ScoringController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScoringController],
      providers: [{ provide: ScoringService, useValue: {} }],
    }).compile();

    controller = module.get<ScoringController>(ScoringController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
