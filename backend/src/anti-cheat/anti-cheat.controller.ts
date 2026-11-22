import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { AccessTokenGuard } from '../auth/guard/access-token/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ModerationService } from './providers/moderation.service';
import { AntiCheatService } from './providers/anti-cheat.service';
import {
  ModerationQueueQueryDto,
  PlayerFlagDto,
  ReviewFlagDto,
} from './dto/moderation.dto';

/**
 * Admin-only endpoints for the anti-cheat moderation queue.
 *
 * All routes require a valid JWT (`AccessTokenGuard`) and the `admin` role
 * (`RolesGuard + @Roles(UserRole.ADMIN)`), following the same pattern as
 * `AdminSongsController`.
 *
 * Base path: /admin/anti-cheat
 */
@ApiTags('admin-anti-cheat')
@ApiBearerAuth()
@Controller('admin/anti-cheat')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AntiCheatController {
  constructor(
    private readonly moderationService: ModerationService,
    private readonly antiCheatService: AntiCheatService,
  ) {}

  /**
   * GET /admin/anti-cheat/flags
   *
   * Returns the moderation queue. Defaults to pending flags; pass
   * `?status=hidden` (or any ModerationStatus value) to see other buckets,
   * or omit the param to see all flags.
   */
  @Get('flags')
  @ApiOperation({
    summary: 'List moderation queue',
    description:
      'Returns all anti-cheat flags, optionally filtered by status or address. ' +
      'Defaults to PENDING flags when no status filter is provided.',
  })
  @ApiResponse({
    status: 200,
    description: 'Moderation queue entries',
    type: [PlayerFlagDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  listFlags(@Query() query: ModerationQueueQueryDto): Promise<PlayerFlagDto[]> {
    return this.moderationService.listFlags(query) as Promise<PlayerFlagDto[]>;
  }

  /**
   * PATCH /admin/anti-cheat/flags/:id
   *
   * Applies a moderation decision (reviewed / hidden / banned) to a single
   * flag and records the reviewing admin's identity.
   */
  @Patch('flags/:id')
  @ApiOperation({
    summary: 'Review a flag',
    description:
      'Update the moderation status of a flag (reviewed / hidden / banned) ' +
      'and optionally attach a reviewer note.',
  })
  @ApiParam({ name: 'id', description: 'Flag UUID' })
  @ApiResponse({
    status: 200,
    description: 'Flag updated',
    type: PlayerFlagDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 404, description: 'Flag not found' })
  reviewFlag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewFlagDto,
    @CurrentUser('sub') adminId: string,
  ): Promise<PlayerFlagDto> {
    return this.moderationService.reviewFlag(
      id,
      dto,
      adminId,
    ) as Promise<PlayerFlagDto>;
  }

  /**
   * GET /admin/anti-cheat/addresses/:address/status
   *
   * Returns the most-severe active flag status for a Stellar address, or
   * null if the address has no active flags.  Useful for per-address checks
   * in other admin tools.
   */
  @Get('addresses/:address/status')
  @ApiOperation({
    summary: 'Get flag status for an address',
    description:
      'Returns the most-severe moderation status for the given address ' +
      '(BANNED > HIDDEN > PENDING > REVIEWED), or null if no flags exist.',
  })
  @ApiParam({ name: 'address', description: 'Stellar G… address' })
  @ApiResponse({ status: 200, description: 'Status or null' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  getAddressStatus(@Param('address') address: string) {
    return this.moderationService.getAddressStatus(address);
  }

  /**
   * POST /admin/anti-cheat/evaluate/:roundId
   *
   * Manually triggers anti-cheat evaluation for a completed round.
   * Useful for re-evaluating rounds that completed before this feature
   * was deployed, or when triggered by an admin following a report.
   */
  @Patch('evaluate/:roundId')
  @ApiOperation({
    summary: 'Manually evaluate a round',
    description:
      'Runs all anti-cheat heuristics against an already-indexed round ' +
      'and writes any new flags to the moderation queue.',
  })
  @ApiParam({ name: 'roundId', description: 'On-chain round ID' })
  @ApiResponse({
    status: 200,
    description: 'Flags raised (empty array if none)',
    type: [PlayerFlagDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  evaluateRound(
    @Param('roundId') roundId: string,
  ): Promise<PlayerFlagDto[]> {
    return this.antiCheatService.evaluateRound(
      roundId,
    ) as Promise<PlayerFlagDto[]>;
  }
}
