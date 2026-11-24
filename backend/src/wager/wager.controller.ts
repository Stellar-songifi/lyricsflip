import {
  Controller,
  Get,
  Param,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WagerService } from './provider/wager.service';
import { WagerReconciliationService } from './services/wager-reconciliation.service';
import { ReconciliationResultDto } from './dto/reconciliation-result.dto';

// Wager history, as read from indexed on-chain state. Placing a wager and
// claiming winnings both happen in the user's wallet by calling the
// contract directly, so there is no write path here.
@ApiTags('wager')
@Controller('wagers')
export class WagerController {
  constructor(
    private readonly wagerService: WagerService,
    private readonly reconciliationService: WagerReconciliationService,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get my wager history',
    description: "Paginated history of the current user's wagers",
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Wager history successfully retrieved',
  })
  getMyWagers(
    @CurrentUser('sub') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.wagerService.findByPlayer(userId, { page, limit });
  }

  /**
   * LF-340: Monitoring panel endpoint. Returns the result of the most recent
   * nightly wager reconciliation (DB open-pot sum vs escrow contract balance).
   * Read-only — this endpoint cannot create or modify any wager record.
   */
  @Get('reconciliation-status')
  @ApiOperation({
    summary: 'Get the latest wager reconciliation status',
    description:
      'LF-340: Returns the most recent nightly reconciliation result comparing the database open-pot sum with the escrow contract on-chain balance. Returns 404 when no reconciliation has run yet.',
  })
  @ApiResponse({
    status: 200,
    description: 'Last reconciliation result',
    type: ReconciliationResultDto,
  })
  getReconciliationStatus(): ReconciliationResultDto | null {
    return this.reconciliationService.getLastResult();
  }
}

// Wagers placed on a specific round.
@ApiTags('wager')
@Controller('rounds')
export class RoundWagerController {
  constructor(private readonly wagerService: WagerService) {}

  @Get(':id/wagers')
  @ApiOperation({ summary: 'Get wagers for a round' })
  @ApiParam({ name: 'id', description: 'Round id', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Round wagers successfully retrieved',
  })
  getRoundWagers(@Param('id') id: string) {
    return this.wagerService.findByRound(id);
  }
}
