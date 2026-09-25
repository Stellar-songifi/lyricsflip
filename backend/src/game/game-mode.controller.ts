import { Controller, Get, Post, Body, Param, Delete, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GameModeService } from './game-mode.service';
import { CustomGameModeService } from './custom-game-mode.service';
import { MatchmakingService } from './matchmaking.service';
import { GameStatsService } from './game-stats.service';
import { GameSessionService } from '../game-session/providers/game-session.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { QueuePlayerDto } from './dtos/queue-player.dto';
import { StartGameDto } from './dtos/start-game.dto';
import { CreateCustomGameModeDto } from './dtos/create-custom-game-mode.dto';

// Static routes are declared before `:id` so they are not shadowed by it.
@ApiTags('game-modes')
@Controller('game-modes')
export class GameModeController {
  constructor(
    private readonly gameModeService: GameModeService,
    private readonly customGameModeService: CustomGameModeService,
    private readonly matchmakingService: MatchmakingService,
    private readonly gameStatsService: GameStatsService,
    private readonly gameSessionService: GameSessionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List built-in game modes' })
  getAllModes() {
    return this.gameModeService.getAllModes();
  }

  @Get('custom')
  @ApiOperation({ summary: 'List player-created game modes' })
  getCustomModes() {
    return this.customGameModeService.findAll();
  }

  @Post('custom')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a custom game mode' })
  createCustomMode(@CurrentUser('sub') userId: string, @Body() dto: CreateCustomGameModeDto) {
    return this.customGameModeService.create(dto, userId);
  }

  @Post('custom/:id/upvote')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upvote a custom game mode' })
  upvoteCustomMode(@Param('id', ParseUUIDPipe) id: string) {
    return this.customGameModeService.upvote(id);
  }

  @Post('queue')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Join the matchmaking queue' })
  queueForGame(@CurrentUser('sub') userId: string, @Body() dto: QueuePlayerDto) {
    this.gameModeService.getModeById(dto.modeId);
    this.matchmakingService.queuePlayer(userId, dto.modeId, dto.skill ?? 1000);
    return { message: 'Added to queue' };
  }

  @Delete('queue')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Leave the matchmaking queue' })
  leaveQueue(@CurrentUser('sub') userId: string) {
    const removed = this.matchmakingService.dequeuePlayer(userId);
    return {
      success: removed,
      message: removed ? 'Removed from queue' : 'Player not in queue',
    };
  }

  @Get('queue/status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get the current user's queue position" })
  getQueueStatus(@CurrentUser('sub') userId: string) {
    return this.matchmakingService.getQueueStatus(userId);
  }

  @Post('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Start a session directly, without matchmaking' })
  startSession(@Body() dto: StartGameDto) {
    return this.gameModeService.startSession(dto.modeId, dto.playerIds);
  }

  @Get('sessions/active')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List in-progress sessions' })
  getActiveSessions() {
    return this.gameSessionService.getActiveSessions();
  }

  @Post('sessions/:id/end')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'End a session and record its result' })
  endSession(@Param('id', ParseUUIDPipe) id: string) {
    return this.gameModeService.endSession(id);
  }

  @Get('players/:id/stats')
  @ApiOperation({ summary: "Get a player's stats across modes" })
  getPlayerStats(@Param('id') id: string) {
    return this.gameStatsService.getPlayerStats(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a built-in game mode' })
  getModeById(@Param('id') id: string) {
    return this.gameModeService.getModeById(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get stats for a game mode' })
  getModeStats(@Param('id') id: string) {
    return this.gameStatsService.getModeStats(id);
  }

  @Get(':id/leaderboard')
  @ApiOperation({ summary: 'Get the leaderboard for a game mode' })
  getModeLeaderboard(@Param('id') id: string) {
    return this.gameStatsService.getLeaderboard(id);
  }
}
