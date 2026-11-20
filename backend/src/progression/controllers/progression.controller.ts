// src/progression/controllers/progression.controller.ts
import { Controller, Post, Body, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProgressionService } from '../services/progression.service';
import { XpEventDto } from '../dtos/xp-event.dto';
import { JwtAuthGuard } from '../../auth/guard/jwt-auth.guard';

@ApiTags('progression')
@Controller('progression')
@UseGuards(JwtAuthGuard)
export class ProgressionController {
  constructor(private readonly progressionService: ProgressionService) {}

  @Post('xp')
  addXp(@Body() xpEvent: XpEventDto) {
    return this.progressionService.addXp(xpEvent);
  }

  @Get(':userId')
  getPlayerStats(@Param('userId') userId: string) {
    return this.progressionService.getOrCreatePlayerStats(userId);
  }
}