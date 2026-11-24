import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { PracticeCardsService } from '../services/practice-cards.service';
import { PracticeRoundDto } from '../dto/practice-card.dto';

/**
 * Public practice endpoint (LF-326 / issue #912).
 *
 * Returns 5 random lyric cards with shuffled multiple-choice options.
 * No authentication is required: this endpoint is intentionally public
 * so new visitors can try a round before connecting a wallet.
 *
 * Route: GET /api/v1/practice
 */
@ApiTags('practice')
@Controller('practice')
export class PracticeCardsController {
  constructor(private readonly practiceCardsService: PracticeCardsService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Get a set of practice cards (no wallet required)',
    description:
      'Returns 5 random lyric cards with shuffled answer options. ' +
      'Practice results are not recorded on-chain or in the database.',
  })
  getPracticeRound(): Promise<PracticeRoundDto> {
    return this.practiceCardsService.getPracticeRound();
  }
}
