import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LessonProgressService } from './providers/lesson-progress.service';

@ApiTags('lesson-progress')
@Controller('lessons/progress')
export class LessonProgressController {
  constructor(private readonly lessonProgressService: LessonProgressService) {}

  @Get()
  findAll() {
    return this.lessonProgressService.findAll();
  }

  @Get('user/:userId')
  findByUser(@Param('userId') user: string) {
    return this.lessonProgressService.findByUser(user);
  }

  @Patch(':id')
  markComplete(@Param('id') id: number) {
    return this.lessonProgressService.markComplete(id);
  }
}
