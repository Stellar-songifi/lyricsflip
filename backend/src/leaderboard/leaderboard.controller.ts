import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { LeaderboardService } from './providers/leaderboard.service';
import {
  LeaderboardQueryDto,
  PaginatedLeaderboardDto,
} from './dto/leaderboard.dto';
import { PlayerProfileDto } from './dto/player-profile.dto';

// Controller for managing leaderboard operations.
@ApiTags('leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  // Retrieve the leaderboard, optionally filtered by period and genre.
  @Get()
  @ApiOperation({
    summary: 'Get leaderboard',
    description:
      'Retrieves the leaderboard ranking, filterable by period and genre',
  })
  @ApiResponse({
    status: 200,
    description: 'Leaderboard successfully retrieved',
    type: PaginatedLeaderboardDto,
  })
  @ApiResponse({ status: 500, description: 'Internal server error occurred' })
  getLeaderboard(@Query() query: LeaderboardQueryDto) {
    return this.leaderboardService.getLeaderboard(query);
  }

  // Retrieve the rank of a specific player.
  @Get('rank/:playerId')
  @ApiOperation({
    summary: 'Get player rank',
    description: 'Retrieves the all-time, all-genre rank of a specific player',
  })
  @ApiParam({
    name: 'playerId',
    type: 'string',
    description: 'Unique identifier of the player',
    example: 'player123',
  })
  @ApiResponse({
    status: 200,
    description: 'Player rank successfully retrieved',
  })
  @ApiResponse({ status: 404, description: 'Player not found' })
  @Get('rank/:playerId')
  getPlayerRank(@Param('playerId') playerId: string) {
    return this.leaderboardService.getPlayerRank(playerId);
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
