import { Module } from '@nestjs/common';
import { QuestionsModule } from '../../questions/questions.module';
import { SongsModule } from '../../songs/songs.module';
import { PracticeModule } from '../../practice/practice.module';

@Module({
  imports: [SongsModule, QuestionsModule, PracticeModule],
  exports: [SongsModule, QuestionsModule, PracticeModule],
})
export class CatalogueModule {}
