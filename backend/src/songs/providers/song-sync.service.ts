import { Injectable, Logger } from '@nestjs/common';
import { SongsService } from '../songs.service';
import { SongStatus } from '../entities/song.entity';
import {
  MAX_CARDS_PER_BATCH,
  SongChainSyncService,
} from './song-chain-sync.service';

export interface SyncResult {
  synced: number;
  cardIds: string[];
}

/**
 * Orchestrates `POST /admin/songs/sync`: submits every 'approved' song to
 * the contract in batches, then records the card id the contract returned
 * and flips the song to 'on_chain'.
 */
@Injectable()
export class SongSyncService {
  private readonly logger = new Logger(SongSyncService.name);

  constructor(
    private readonly songsService: SongsService,
    private readonly chainSyncService: SongChainSyncService,
  ) {}

  async syncApprovedSongs(): Promise<SyncResult> {
    const approved = await this.songsService.findByStatus(SongStatus.APPROVED);
    const cardIds: string[] = [];

    for (let i = 0; i < approved.length; i += MAX_CARDS_PER_BATCH) {
      const batch = approved.slice(i, i + MAX_CARDS_PER_BATCH);
      const ids = await this.chainSyncService.addCards(batch);

      for (let j = 0; j < batch.length; j++) {
        const cardId = ids[j].toString();
        await this.songsService.markSynced(batch[j].id, cardId);
        cardIds.push(cardId);
      }
    }

    this.logger.log(`Synced ${cardIds.length} song(s) to the contract`);
    return { synced: cardIds.length, cardIds };
  }
}
