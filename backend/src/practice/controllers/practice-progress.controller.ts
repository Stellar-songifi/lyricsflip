// src/practice/controllers/practice-progress.controller.ts
import { Controller, Get, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guard/jwt-auth.guard';
import { PracticeProgressService } from '../services/practice-progress.service';
import { Genre } from '../../songs/enums/genre.enum';

@ApiTags('practice-progress')
@ApiBearerAuth()
@Controller('practice/progress')
@UseGuards(JwtAuthGuard)
export class PracticeProgressController {
  constructor(private readonly progressService: PracticeProgressService) {}

  @Get()
  getUserProgress(@Request() req, @Query('genre') genre?: Genre) {
    return this.progressService.getUserProgress(req.user.sub, genre);
  }
}
