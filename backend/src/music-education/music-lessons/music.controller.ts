import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MusicLesson } from './entities/music-theory-lesson.entity';
import { MusicLessonsService } from './providers/music-theory-lesson.service';

@ApiTags('music-lessons')
@Controller('music-lessons')
export class MusicLessonsController {
  constructor(private readonly musicLessonsService: MusicLessonsService) {}

  @Get()
  findAll() {
    return this.musicLessonsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.musicLessonsService.findOne(id);
  }

  @Post()
  create(@Body() lesson: Partial<MusicLesson>) {
    return this.musicLessonsService.create(lesson);
  }
}
