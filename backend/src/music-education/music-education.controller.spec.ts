import { Test, TestingModule } from '@nestjs/testing';
import { MusicEducationController } from './music-theory-lesson.controller';
import { MusicEducationService } from './music-theory-lesson.service';

describe('MusicEducationController', () => {
  let controller: MusicEducationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MusicEducationController],
      providers: [MusicEducationService],
    }).compile();

    controller = module.get<MusicEducationController>(MusicEducationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
