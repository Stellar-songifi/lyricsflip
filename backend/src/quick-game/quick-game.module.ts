import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module';
import { QuestionsService } from '../questions/questions.service';
import { QuickGameController } from './quick-game.controller';
import { QuickGameService } from './quick-game.service';

@Module({
  imports: [QuestionsModule],
  controllers: [QuickGameController],
  providers: [
    {
      provide: QuickGameService,
      useFactory: (questions: QuestionsService) => new QuickGameService(questions),
      inject: [QuestionsService],
    },
  ],
})
export class QuickGameModule {}
