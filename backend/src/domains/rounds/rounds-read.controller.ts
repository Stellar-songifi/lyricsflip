import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createHash } from 'crypto';
import { RoundsReadService } from './providers/rounds-read.service';
import {
  ChainPlayerStatsDto,
  OpenRoundsQueryDto,
  PaginatedOpenRoundsDto,
  RoundDetailDto,
} from './dto/rounds-read.dto';

/**
 * Public read endpoints for chain data, served from the indexer's mirror
 * tables and a Redis read-through cache.
 *
 * These routes are intentionally **unauthenticated** — the lobby and player
 * stats pages are public views. This avoids requiring a wallet connection
 * just to see open rounds, which is the primary source of direct Soroban
 * RPC calls from the frontend (LF-356).
 *
 * ETag support: every response carries an `ETag` header derived from a
 * SHA-256 hash of the response body. Clients may send `If-None-Match` on
 * subsequent requests; if the data has not changed the handler returns
 * 304 Not Modified with no body, reducing bandwidth.
 *
 * Cache-Control: `public, max-age=10` for the open-rounds list (matching
 * the Redis TTL); `public, max-age=15` for round detail; `public, max-age=30`
 * for player stats. These values align with the Redis TTLs so a CDN or
 * reverse proxy does not serve data older than the cache allows.
 *
 * Base path: /rounds  (resolves to /api/v1/rounds via global prefix + versioning)
 */
@ApiTags('rounds-read')
@Controller('rounds')
export class RoundsReadController {
  constructor(private readonly roundsReadService: RoundsReadService) {}

  // ─── Open lobby list ────────────────────────────────────────────────────

  /**
   * GET /api/v1/rounds/open
   *
   * Returns all currently joinable rounds with their player rosters.
   * Served from the indexed `chain_round` + `chain_round_player` tables
   * and cached in Redis for 10 s. Invalidated on any lobby event
   * (created, joined, started, cancelled).
   *
   * Public — no authentication required.
   */
  @Get('open')
  @ApiOperation({
    summary: 'List open (joinable) rounds',
    description:
      'Returns all rounds with status "open", with their current player ' +
      'roster. Served from the indexer with 10 s Redis caching and ETag ' +
      'support. No Soroban RPC call is made.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'genre', required: false, type: String })
  @ApiHeader({
    name: 'If-None-Match',
    required: false,
    description: 'ETag from a previous response; returns 304 if unchanged',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of open rounds',
    type: PaginatedOpenRoundsDto,
  })
  @ApiResponse({ status: 304, description: 'Not modified (ETag matched)' })
  async getOpenRounds(
    @Query() query: OpenRoundsQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.roundsReadService.getOpenRounds(query);
    this.sendWithEtag(res, data, 'public, max-age=10', ifNoneMatch);
  }

  // ─── Round detail ────────────────────────────────────────────────────────

  /**
   * GET /api/v1/rounds/:id
   *
   * Returns full detail for a single round: status, genre, players, and
   * per-player final results (populated once the round completes).
   *
   * Note: the existing `GET /api/v1/rounds/:id` route on `RoundsController`
   * requires authentication and delegates to `GameSessionService` (which
   * reads the off-chain `game_sessions` table). This route reads the
   * on-chain `chain_round` mirror from the indexer and is public — it uses
   * a different controller class registered alongside the existing one,
   * so no existing functionality is broken.
   *
   * Public — no authentication required.
   */
  @Get('chain/:roundId')
  @ApiOperation({
    summary: 'Get on-chain round detail',
    description:
      'Returns full on-chain round detail: status, genre, players, and ' +
      'final results (once completed). Served from the indexer with 15 s ' +
      'Redis caching and ETag support.',
  })
  @ApiParam({ name: 'roundId', description: 'On-chain round ID (not a UUID)' })
  @ApiHeader({
    name: 'If-None-Match',
    required: false,
    description: 'ETag from a previous response',
  })
  @ApiResponse({
    status: 200,
    description: 'Round detail',
    type: RoundDetailDto,
  })
  @ApiResponse({ status: 304, description: 'Not modified' })
  @ApiResponse({ status: 404, description: 'Round not found in index' })
  async getRoundById(
    @Param('roundId') roundId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.roundsReadService.getRoundById(roundId);
    this.sendWithEtag(res, data, 'public, max-age=15', ifNoneMatch);
  }

  // ─── Player stats ─────────────────────────────────────────────────────────

  /**
   * GET /api/v1/players/:address/stats
   *
   * Returns aggregate on-chain stats for a Stellar address: rounds played,
   * wins, accuracy, total points, and streak. Derived from indexed
   * `chain_round_result` rows and cached in Redis for 30 s.
   *
   * Public — no authentication required.
   */
  @Get('/players/:address/stats')
  @ApiOperation({
    summary: 'Get player on-chain stats',
    description:
      'Returns aggregated stats (rounds played, wins, accuracy, points) ' +
      'for a Stellar address, derived from indexed chain_round_result rows. ' +
      'Cached in Redis for 30 s.',
  })
  @ApiParam({ name: 'address', description: 'Stellar G… address' })
  @ApiHeader({
    name: 'If-None-Match',
    required: false,
    description: 'ETag from a previous response',
  })
  @ApiResponse({
    status: 200,
    description: 'Player stats',
    type: ChainPlayerStatsDto,
  })
  @ApiResponse({ status: 304, description: 'Not modified' })
  async getPlayerStats(
    @Param('address') address: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.roundsReadService.getPlayerStats(address);
    this.sendWithEtag(res, data, 'public, max-age=30', ifNoneMatch);
  }

  // ─── ETag helper ─────────────────────────────────────────────────────────

  /**
   * Serialises `body` to JSON, computes a weak ETag from its SHA-256 hash,
   * and either returns 304 (when `If-None-Match` matches) or sends the full
   * JSON body with the ETag and Cache-Control headers.
   */
  private sendWithEtag(
    res: Response,
    body: unknown,
    cacheControl: string,
    ifNoneMatch: string | undefined,
  ): void {
    const json = JSON.stringify(body);
    const hash = createHash('sha256').update(json).digest('hex').slice(0, 16);
    const etag = `W/"${hash}"`;

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', cacheControl);

    // Strip surrounding quotes from If-None-Match for comparison
    const clientEtag = ifNoneMatch?.replace(/^W\//i, '').replace(/"/g, '');
    const serverHash = hash;

    if (clientEtag === serverHash || `"${clientEtag}"` === `W/"${serverHash}"` || ifNoneMatch === etag) {
      res.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }

    res.status(HttpStatus.OK).json(body);
  }
}
