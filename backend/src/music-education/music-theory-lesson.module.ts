import { Module } from '@nestjs/common';
import { MusicEducationService } from './music-theory-lesson.service';
import { Artist } from './artists/entities/artist.entity';
import { GenreHistory } from './genre-history/entities/genre-history.entity';
import { Quiz } from './quiz/entities/quiz.entity';
import { LessonProgress } from './lesson-progress/entities/lesson-progress.entity';
import { MusicLesson } from './music-lessons/entities/music-theory-lesson.entity';
import { MusicEducationController } from './music-theory-lesson.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MusicLessonsService } from './music-lessons/providers/music-theory-lesson.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Artist,
      GenreHistory,
      MusicLesson,
      Quiz,
      LessonProgress,
    ]),
  ],
  controllers: [MusicEducationController],
  providers: [MusicEducationService, MusicLessonsService],
  exports: [MusicLessonsService],
})
export class MusicTheoryLessonModule {}
