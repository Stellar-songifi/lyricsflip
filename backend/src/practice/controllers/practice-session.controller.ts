// src/practice/controllers/practice-session.controller.ts
import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guard/jwt-auth.guard';
import { PracticeSessionService } from '../services/practice-session.service';
import { CreateSessionDto } from '../dto/create-session.dto';

@ApiTags('practice-sessions')
@ApiBearerAuth()
@Controller('practice/sessions')
@UseGuards(JwtAuthGuard)
export class PracticeSessionController {
  constructor(private readonly sessionService: PracticeSessionService) {}

  @Post()
  create(@Request() req, @Body() createSessionDto: CreateSessionDto) {
    return this.sessionService.createSession(req.user, createSessionDto);
  }

  @Get()
  findAll(@Request() req) {
    return this.sessionService.getUserSessions(req.user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sessionService.getSessionById(id);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.sessionService.completeSession(id);
  }

  @Get(':id/items')
  getSessionItems(@Param('id') id: string) {
    return this.sessionService.getSessionItems(id);
  }
}
