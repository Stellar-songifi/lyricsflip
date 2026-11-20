import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../../auth/guard/access-token/access-token.guard';
import { CreateGameSessionDto } from '../../game-session/dto/create-game-session.dto';
import { GameSessionService } from '../../game-session/providers/game-session.service';

@ApiTags('rounds')
@Controller('rounds')
@UseGuards(AccessTokenGuard)
export class RoundsController {
  constructor(private readonly gameSessionService: GameSessionService) {}

  @Post()
  @ApiOperation({ summary: 'Start a new round' })
  start(@Body() dto: CreateGameSessionDto) {
    return this.gameSessionService.start(dto);
  }

  @Get('active')
  @ApiOperation({ summary: 'List in-progress rounds' })
  active() {
    return this.gameSessionService.getActiveSessions();
  }

  @Post(':id/guess')
  @ApiOperation({ summary: 'Submit a guess for a round' })
  guess() {
    return this.gameSessionService.submitGuess();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a round by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.gameSessionService.findOne(id);
  }
}
