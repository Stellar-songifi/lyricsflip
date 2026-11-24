import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { LeaderboardService } from './providers/leaderboard.service';
import { LeaderboardBoardService } from './providers/leaderboard-board.service';
import {
  LeaderboardQueryDto,
  LeaderboardRankQueryDto,
  PaginatedLeaderboardDto,
  PlayerRankDto,
} from './dto/leaderboard.dto';
import { PlayerProfileDto } from './dto/player-profile.dto';

// Controller for managing leaderboard operations.
@ApiTags('leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly boardService: LeaderboardBoardService) {}

  // Retrieve a page of a leaderboard for a window and metric.
  @Get()
  @ApiOperation({
    summary: 'Get leaderboard',
    description:
      'Ranking derived from indexed on-chain data, for a daily, weekly or all-time window and a wins, points or streak metric',
  })
  @ApiResponse({
    status: 200,
    description: 'Leaderboard successfully retrieved',
    type: PaginatedLeaderboardDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid window, metric or page' })
  getLeaderboard(@Query() query: LeaderboardQueryDto) {
    return this.boardService.getBoard(query);
  }

  // Retrieve the rank of a specific player.
  @Get('rank/:address')
  @ApiOperation({
    summary: 'Get player rank',
    description:
      'Rank and score of an address on the board for a window and metric',
  })
  @ApiParam({
    name: 'address',
    type: 'string',
    description: 'Stellar address of the player',
  })
  @ApiResponse({
    status: 200,
    description: 'Player rank successfully retrieved',
    type: PlayerRankDto,
  })
  @ApiResponse({ status: 404, description: 'Player has no ranked rounds' })
  async getPlayerRank(
    @Param('address') address: string,
    @Query() query: LeaderboardRankQueryDto,
  ) {
    const rank = await this.boardService.getRank(
      address,
      query.window,
      query.metric,
    );
    if (!rank) {
      throw new NotFoundException(`Player ${address} is not on this board`);
    }
    return rank;
  }
}

// Controller for player profile pages, backed by indexed data.
@ApiTags('players')
@Controller('players')
export class PlayersController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  // Retrieve the profile of a specific player by address.
  @Get(':address')
  @ApiOperation({
    summary: 'Get player profile',
    description:
      'Retrieves stats, recent rounds, badges and unclaimed winnings for a player address',
  })
  @ApiParam({
    name: 'address',
    type: 'string',
    description: 'Stellar address of the player',
    example: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUV',
  })
  @ApiResponse({
    status: 200,
    description: 'Player profile successfully retrieved',
    type: PlayerProfileDto,
  })
  @ApiResponse({ status: 404, description: 'Player not found' })
  @ApiResponse({ status: 500, description: 'Internal server error occurred' })
  async getPlayerProfile(@Param('address') address: string) {
    const profile = await this.leaderboardService.getPlayerProfile(address);
    if (!profile) {
      throw new NotFoundException(`Player ${address} not found`);
    }
    return profile;
  }
}
