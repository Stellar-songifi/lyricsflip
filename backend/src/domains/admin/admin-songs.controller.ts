import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { SongsService } from '../../songs/songs.service';
import { SongSyncService } from '../../songs/providers/song-sync.service';
import { SubmitSongDto } from '../../songs/dto/submit-song.dto';
import { UpdateSongDto } from '../../songs/dto/update-song.dto';
import { RejectSongDto } from '../../songs/dto/reject-song.dto';
import { MarkPublishedDto } from '../../songs/dto/mark-published.dto';
import { PublishResultDto } from '../../songs/dto/publish-result.dto';

/**
 * Admin-only song catalogue management.
 *
 * Review workflow (all require ADMIN role):
 *
 *   POST /admin/songs              — add a card as SUBMITTED
 *   POST /admin/songs/:id/review   — SUBMITTED | DRAFT → IN_REVIEW
 *   POST /admin/songs/:id/approve  — IN_REVIEW | SUBMITTED | DRAFT → APPROVED
 *   POST /admin/songs/:id/reject   — IN_REVIEW | SUBMITTED | DRAFT → REJECTED
 *   POST /admin/songs/publish      — build unsigned add_cards XDR for all APPROVED songs
 *   POST /admin/songs/:id/mark-published  — record on-chain card_id → ON_CHAIN
 *
 * Every approved card published on-chain will have a database record storing
 * its license, source, difficulty, reviewer, and the contract card_id.
 */
@ApiTags('admin-songs')
@ApiBearerAuth()
@Controller('admin/songs')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSongsController {
  constructor(
    private readonly songsService: SongsService,
    private readonly songSyncService: SongSyncService,
  ) {}

  // ── Catalogue CRUD ──────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List every song regardless of curation status' })
  findAll() {
    return this.songsService.findAllForAdmin();
  }

  @Post()
  @ApiOperation({
    summary: 'Add a song to the catalogue (starts in SUBMITTED status)',
    description:
      'License must be one of the values allowed by docs/content-policy.md ' +
      '(CC0-1.0, CC-PDDC, LicenseRef-PublicDomain, or LicenseRef-<provider>). ' +
      'The card is not visible to players until it reaches APPROVED or ON_CHAIN.',
  })
  @ApiResponse({ status: 201, description: 'Song created in SUBMITTED status' })
  @ApiResponse({ status: 400, description: 'License not permitted by content policy' })
  create(@Body() dto: SubmitSongDto) {
    return this.songsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a song' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSongDto,
  ) {
    return this.songsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a song' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.songsService.remove(id);
  }

  // ── Review workflow ─────────────────────────────────────────────────────────

  @Post(':id/review')
  @ApiOperation({
    summary: 'Start review — SUBMITTED | DRAFT → IN_REVIEW',
    description:
      'Assigns the calling admin as reviewer and moves the card into review. ' +
      'Cards in IN_REVIEW are still hidden from public listings.',
  })
  @ApiResponse({ status: 201, description: 'Song moved to IN_REVIEW' })
  @ApiResponse({ status: 400, description: 'Song is not in a reviewable status' })
  @ApiResponse({ status: 404, description: 'Song not found' })
  startReview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') reviewerId: string,
  ) {
    return this.songsService.startReview(id, reviewerId);
  }

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve a card — IN_REVIEW | SUBMITTED | DRAFT → APPROVED',
    description:
      'Re-validates the license at approval time and makes the card eligible ' +
      'for the next POST /admin/songs/publish run.',
  })
  @ApiResponse({ status: 201, description: 'Song approved' })
  @ApiResponse({ status: 400, description: 'Song is not in an approvable status, or license is disallowed' })
  @ApiResponse({ status: 404, description: 'Song not found' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') reviewerId: string,
  ) {
    return this.songsService.approveSong(id, reviewerId);
  }

  @Post(':id/reject')
  @ApiOperation({
    summary: 'Reject a card — IN_REVIEW | SUBMITTED | DRAFT → REJECTED',
    description:
      'A rejection reason is required; it is stored on the card and shown in ' +
      'the admin dashboard. Rejected cards are hidden from all public listings.',
  })
  @ApiResponse({ status: 201, description: 'Song rejected' })
  @ApiResponse({ status: 400, description: 'Song is not in a rejectable status' })
  @ApiResponse({ status: 404, description: 'Song not found' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectSongDto,
    @CurrentUser('sub') reviewerId: string,
  ) {
    return this.songsService.rejectSong(id, reviewerId, dto.reason);
  }

  // ── On-chain publishing ──────────────────────────────────────────────────────

  @Post('publish')
  @ApiOperation({
    summary: 'Build unsigned add_cards XDR batches for all APPROVED songs',
    description:
      'Returns one unsigned Soroban transaction XDR per batch of ≤20 cards. ' +
      'The admin wallet (LF-219) must sign and submit each XDR, then call ' +
      'POST /admin/songs/:id/mark-published with the returned on-chain card_id. ' +
      'The API holds no secret key (LF-227); it never signs or submits.',
  })
  @ApiResponse({
    status: 201,
    type: PublishResultDto,
    description: 'Unsigned XDR batch(es) ready for the admin wallet to sign',
  })
  publish() {
    return this.songSyncService.buildPublishBatches();
  }

  @Post(':id/mark-published')
  @ApiOperation({
    summary: 'Record the on-chain card_id for a confirmed card — APPROVED → ON_CHAIN',
    description:
      'Call this for each song after the admin wallet has signed and submitted ' +
      'the XDR from POST /admin/songs/publish and the transaction is confirmed. ' +
      'Stores the contract-returned card_id and flips the song to ON_CHAIN, ' +
      'satisfying the acceptance criterion: every on-chain card has a database ' +
      'record with its license and reviewer.',
  })
  @ApiResponse({ status: 201, description: 'Song marked as ON_CHAIN with card_id recorded' })
  @ApiResponse({ status: 400, description: 'Song is not in APPROVED status' })
  @ApiResponse({ status: 404, description: 'Song not found' })
  markPublished(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkPublishedDto,
  ) {
    return this.songsService.markPublished(id, dto.onChainCardId);
  }

  /**
   * @deprecated Use POST /admin/songs/publish + POST /admin/songs/:id/mark-published.
   * Kept for a transition period so existing tooling gets a clear 400 error
   * rather than a 404.
   */
  @Post('sync')
  @ApiOperation({
    summary: '[Deprecated] Use POST /admin/songs/publish instead',
    deprecated: true,
  })
  sync() {
    return this.songSyncService.syncApprovedSongs();
  }
}
