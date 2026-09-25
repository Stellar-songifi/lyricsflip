// src/practice/controllers/practice-result.controller.ts
import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guard/jwt-auth.guard';
import { PracticeResultService } from '../services/practice-result.service';
import { SubmitResultDto } from '../dto/submit-result.dto';

@ApiTags('practice-results')
@ApiBearerAuth()
@Controller('practice/results')
@UseGuards(JwtAuthGuard)
export class PracticeResultController {
  constructor(private readonly resultService: PracticeResultService) {}

  @Post('sessions/:sessionId/items/:itemId')
  submitResult(
    @Request() req,
    @Param('sessionId') sessionId: string,
    @Param('itemId') itemId: string,
    @Body() submitResultDto: SubmitResultDto
  ) {
    return this.resultService.submitResult(
      req.user,
      sessionId,
      itemId,
      submitResultDto
    );
  }

  @Get()
  findAll(@Request() req) {
    return this.resultService.getUserResults(req.user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.resultService.getResultById(id);
  }

  @Get('sessions/:sessionId')
  getSessionResults(@Param('sessionId') sessionId: string) {
    return this.resultService.getSessionResults(sessionId);
  }
}
