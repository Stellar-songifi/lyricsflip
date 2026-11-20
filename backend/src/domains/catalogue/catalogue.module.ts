import { Module } from '@nestjs/common';
import { QuestionsModule } from '../../questions/questions.module';
import { SongsModule } from '../../songs/songs.module';

@Module({
  imports: [SongsModule, QuestionsModule],
  exports: [SongsModule, QuestionsModule],
})
export class CatalogueModule {}
