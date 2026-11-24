// src/practice/practice.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Song } from '../songs/entities/song.entity';
import { PracticeCardsService } from './services/practice-cards.service';
import { PracticeCardsController } from './controllers/practice-cards.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Song])],
  controllers: [PracticeCardsController],
  providers: [PracticeCardsService],
  exports: [PracticeCardsService],
})
export class PracticeModule {}
