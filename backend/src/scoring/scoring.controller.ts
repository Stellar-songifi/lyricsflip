import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ScoringService } from './scoring.service';
import { CreateScoringDto } from './dto/create-scoring.dto';
import { UpdateScoringDto } from './dto/update-scoring.dto';

@ApiTags('scoring')
@Controller('scoring')
export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  @Post('record')
  async recordScore(@Body() createScoringDto: CreateScoringDto) {
    return await this.scoringService.recordScore(createScoringDto.userId, createScoringDto.score);
  }


  @Get('rankings')
  async calculateRankings() {
    return await this.scoringService.calculateRankings();
  }

  @Get('user/:userId')
  async getUserStatistics(@Param('userId') userId: string) {
    return await this.scoringService.getUserStatistics(userId);
  }

  @Get('leaderboard')
  async getLeaderboard() {
    return await this.scoringService.getLeaderboard();
  }

  @Patch(':id')
  async updateScore(@Param('id') id: number, @Body() updateScoringDto: UpdateScoringDto) {
    return await this.scoringService.updateScore(id, updateScoringDto);
  }

}
