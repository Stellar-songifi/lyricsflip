// src/practice/practice.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PracticeSession } from './entities/practice-session.entity';
import { PracticeResult } from './entities/practice-result.entity';
import { PracticeItem } from './entities/practice-item.entity';
import { PracticeProgress } from './entities/practice-progress.entity';
import { PracticeSessionService } from './services/practice-session.service';
import { PracticeItemService } from './services/practice-item.service';
import { PracticeResultService } from './services/practice-result.service';
import { FeedbackService } from './services/feedback.service';
import { PracticeProgressService } from './services/practice-progress.service';
import { PracticeSessionController } from './controllers/practice-session.controller';
import { PracticeItemController } from './controllers/practice-item.controller';
import { PracticeResultController } from './controllers/practice-result.controller';
import { PracticeProgressController } from './controllers/practice-progress.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PracticeSession,
      PracticeResult,
      PracticeItem,
      PracticeProgress
    ])
  ],
  controllers: [
    PracticeSessionController,
    PracticeItemController,
    PracticeResultController,
    PracticeProgressController
  ],
  providers: [
    PracticeSessionService,
    PracticeItemService,
    PracticeResultService,
    FeedbackService,
    PracticeProgressService
  ],
  exports: [
    PracticeSessionService,
    PracticeItemService,
    PracticeResultService,
    PracticeProgressService
  ]
})
export class PracticeModule {}
