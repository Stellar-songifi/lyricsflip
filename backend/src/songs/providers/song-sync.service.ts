import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SongsService } from '../songs.service';
import { SongStatus } from '../entities/song.entity';
import {
  MAX_CARDS_PER_BATCH,
  SongChainSyncService,
} from './song-chain-sync.service';
import { PublishBatchDto, PublishResultDto } from '../dto/publish-result.dto';

/**
 * Orchestrates POST /admin/songs/publish.
 *
 * The API process holds **no** secret key (LF-227).  Instead of signing and
 * submitting the transaction itself, this service builds one unsigned
 * add_cards transaction per batch of ≤20 approved songs and returns the XDR
 * payloads for the admin wallet to sign in the admin UI (LF-219).
 *
 * After the admin wallet signs and submits each batch the client must call
 * POST /admin/songs/:id/mark-published for each card, supplying the on-chain
 * card_id the transaction returned.  That call flips the song to ON_CHAIN and
 * stores the card_id.
 */
@Injectable()
export class SongSyncService {
  private readonly logger = new Logger(SongSyncService.name);

  constructor(
    private readonly songsService: SongsService,
    private readonly chainSyncService: SongChainSyncService,
  ) {}

  /**
   * Fetches all APPROVED songs, splits them into batches of MAX_CARDS_PER_BATCH,
   * and builds an unsigned add_cards transaction XDR for each batch.
   *
   * Returns the list of XDR strings and the song UUIDs included in each batch
   * so the admin UI can correlate the on-chain card_ids after submission.
   */
  async buildPublishBatches(): Promise<PublishResultDto> {
    const approved = await this.songsService.findByStatus(SongStatus.APPROVED);

    if (approved.length === 0) {
      this.logger.log('No approved songs to publish');
      return { total: 0, batches: [] };
    }

    const batches: PublishBatchDto[] = [];

    for (let i = 0; i < approved.length; i += MAX_CARDS_PER_BATCH) {
      const batch = approved.slice(i, i + MAX_CARDS_PER_BATCH);
      const xdr = await this.chainSyncService.buildAddCardsTransaction(batch);
      batches.push({
        xdr,
        songIds: batch.map((s) => s.id),
      });
    }

    this.logger.log(
      `Built ${batches.length} unsigned add_cards batch(es) for ${approved.length} approved song(s)`,
    );

    return { total: approved.length, batches };
  }

  /**
   * @deprecated  The old sync flow signed and submitted the transaction
   * server-side, which violates the LF-227 no-secret-in-API rule.  Use
   * buildPublishBatches() + POST /admin/songs/:id/mark-published instead.
   *
   * Kept as a compatibility shim so any callers that haven't migrated yet
   * get a clear error rather than a silent no-op.
   */
  async syncApprovedSongs(): Promise<never> {
    throw new BadRequestException(
      'syncApprovedSongs() is deprecated.  Use POST /admin/songs/publish to get ' +
        'unsigned XDR batches, sign them in the admin wallet, then call ' +
        'POST /admin/songs/:id/mark-published for each confirmed card.',
    );
  }
}
