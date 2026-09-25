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

// Wager history, as read from indexed on-chain state. Placing a wager and
// claiming winnings both happen in the user's wallet by calling the
// contract directly, so there is no write path here.
@ApiTags('wager')
@Controller('wagers')
export class WagerController {
  constructor(private readonly wagerService: WagerService) {}

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
