import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { QuickGameService } from './quick-game.service';
import { StartRoundDto } from './dto/start-round.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';

const playerIdOf = (req: any): string => req.user?.sub ?? req.user?.userId;

@ApiTags('quick-game')
@Controller('quick-game/rounds')
export class QuickGameController {
  constructor(private readonly quickGameService: QuickGameService) {}

  @Post()
  @ApiOperation({ summary: 'Start an off-chain Quick Game round' })
  start(@Req() req, @Body() dto: StartRoundDto) {
    return this.quickGameService.startRound(playerIdOf(req), dto.difficulty, dto.count);
  }

  @Get(':roundId/question')
  @ApiOperation({ summary: 'Get the current question (without its answer)' })
  next(@Req() req, @Param('roundId', ParseUUIDPipe) roundId: string) {
    return this.quickGameService.nextQuestion(playerIdOf(req), roundId);
  }

  @Post(':roundId/answers')
  @ApiOperation({ summary: 'Answer the current question; the server scores it' })
  answer(
    @Req() req,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: SubmitAnswerDto,
  ) {
    return this.quickGameService.submitAnswer(
      playerIdOf(req),
      roundId,
      dto.questionId,
      dto.answerIndex,
    );
  }

  @Get(':roundId')
  @ApiOperation({ summary: 'Round summary: score and anti-cheat flags' })
  summary(@Req() req, @Param('roundId', ParseUUIDPipe) roundId: string) {
    return this.quickGameService.getSummary(playerIdOf(req), roundId);
  }
}
