import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GameResultsService } from './game-results.service';
import { CreateGameResultDto } from './dto/game-result.dto';
import { GameResult } from './entities/game-result.entity';
import { LeaderboardEntryDto } from './dto/leaderboard-entry.dto';
// Assuming you have some form of authentication
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('game-results')
@Controller('game-results')
export class GameResultsController {
  constructor(private readonly gameResultsService: GameResultsService) {}

  @Post()
  // @UseGuards(JwtAuthGuard)
  async createResult(
    @Body() createGameResultDto: CreateGameResultDto,
  ): Promise<GameResult> {
    return this.gameResultsService.createResult(createGameResultDto);
  }

  @Get('leaderboard/:gameId')
  async getLeaderboard(
    @Param('gameId') gameId: string,
    @Query('limit') limit?: number,
  ): Promise<LeaderboardEntryDto[]> {
    return this.gameResultsService.generateLeaderboard(gameId, limit);
  }

  @Get('user/:userId/game/:gameId/best')
  // @UseGuards(JwtAuthGuard)
  async getUserBest(
    @Param('userId') userId: string,
    @Param('gameId') gameId: string,
  ): Promise<GameResult | null> {
    return this.gameResultsService.getUserBest(userId, gameId);
  }

  @Get('/user/:userId')
  @ApiOperation({ summary: 'Get user results with pagination' })
  @ApiResponse({
    status: 200,
    description: 'List of user results successfully retrieved',
  })
  public getUserResults(
    @Param('userId') userId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ): Promise<GameResult[]> {
    return this.gameResultsService.getUserResults(userId, page, limit);
  }
}
