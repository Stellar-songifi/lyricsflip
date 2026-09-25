import { Controller, Post, Get, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AnswerThrottle } from '../common/throttler/throttle-limits';
import { GameSessionService } from './providers/game-session.service';
import { AccessTokenGuard } from '../auth/guard/access-token/access-token.guard';
import { CreateGameSessionDto } from './dto/create-game-session.dto';

// Controller for managing game sessions.
@ApiTags('game-session') // Groups endpoints under the 'game-session' tag in Swagger
@UseGuards(AccessTokenGuard)
@Controller('game-session')
export class GameSessionController {
  constructor(private readonly gameSessionService: GameSessionService) {}

  // Start a new game session.
  @Post()
  @ApiOperation({
    summary: 'Start a new game session',
    description: 'Creates a new game session and returns the session details.',
  })
  @ApiResponse({
    status: 201,
    description: 'Game session successfully created.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  startGameSession(@Body() dto: CreateGameSessionDto) {
    return this.gameSessionService.start(dto);
  }

  // List sessions that are still in progress.
  @Get('active')
  @ApiOperation({ summary: 'List in-progress game sessions' })
  getActiveSessions() {
    return this.gameSessionService.getActiveSessions();
  }

  // Submit a guess for an ongoing game session.
  @Post(':id/guess')
  @AnswerThrottle()
  @ApiOperation({
    summary: 'Submit a guess for a game session',
    description:
      'Allows a player to submit a guess for an ongoing game session.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the game session.',
    example: 'abc123',
  })
  @ApiBody({
    description: 'Details of the submitted guess.',
    schema: {
      example: {
        playerId: 'player1',
        guess: 'word123',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Guess successfully submitted.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid guess data.',
  })
  submitGuess() {
    return this.gameSessionService.submitGuess();
  }

  // Retrieve the details of a specific game session.
  @Get(':id')
  @ApiOperation({
    summary: 'Get game session details',
    description: 'Retrieves details of a specific game session by its ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the game session.',
    example: 'abc123',
  })
  @ApiResponse({
    status: 200,
    description: 'Game session details retrieved.',
  })
  @ApiResponse({
    status: 404,
    description: 'Game session not found.',
  })
  getSessionDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.gameSessionService.findOne(id);
  }
}
