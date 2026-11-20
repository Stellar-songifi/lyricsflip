import { Test, TestingModule } from '@nestjs/testing';
import { SongSyncService } from './song-sync.service';
import {
  SongChainSyncService,
  MAX_CARDS_PER_BATCH,
} from './song-chain-sync.service';
import { SongsService } from '../songs.service';
import { Song, SongStatus } from '../entities/song.entity';

describe('SongSyncService', () => {
  let service: SongSyncService;
  let songsService: jest.Mocked<SongsService>;
  let chainSyncService: jest.Mocked<SongChainSyncService>;

  const makeSong = (id: string): Song =>
    ({ id, status: SongStatus.APPROVED }) as Song;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SongSyncService,
        {
          provide: SongsService,
          useValue: { findByStatus: jest.fn(), markSynced: jest.fn() },
        },
        { provide: SongChainSyncService, useValue: { addCards: jest.fn() } },
      ],
    }).compile();

    service = module.get<SongSyncService>(SongSyncService);
    songsService = module.get(SongsService);
    chainSyncService = module.get(SongChainSyncService);
  });

  it('does nothing when there are no approved songs', async () => {
    songsService.findByStatus.mockResolvedValue([]);

    const result = await service.syncApprovedSongs();

    expect(chainSyncService.addCards).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, cardIds: [] });
  });

  it('syncs approved songs and records the returned on-chain card ids', async () => {
    const songs = [makeSong('a'), makeSong('b')];
    songsService.findByStatus.mockResolvedValue(songs);
    chainSyncService.addCards.mockResolvedValue([1n, 2n]);

    const result = await service.syncApprovedSongs();

    expect(songsService.markSynced).toHaveBeenNthCalledWith(1, 'a', '1');
    expect(songsService.markSynced).toHaveBeenNthCalledWith(2, 'b', '2');
    expect(result).toEqual({ synced: 2, cardIds: ['1', '2'] });
  });

  it('splits more than MAX_CARDS_PER_BATCH songs into multiple batches', async () => {
    const songs = Array.from({ length: MAX_CARDS_PER_BATCH + 5 }, (_, i) =>
      makeSong(`s${i}`),
    );
    songsService.findByStatus.mockResolvedValue(songs);
    chainSyncService.addCards.mockImplementation(async (batch) =>
      batch.map((_, i) => BigInt(i + 1)),
    );

    const result = await service.syncApprovedSongs();

    expect(chainSyncService.addCards).toHaveBeenCalledTimes(2);
    expect(chainSyncService.addCards.mock.calls[0][0]).toHaveLength(
      MAX_CARDS_PER_BATCH,
    );
    expect(chainSyncService.addCards.mock.calls[1][0]).toHaveLength(5);
    expect(result.synced).toBe(MAX_CARDS_PER_BATCH + 5);
  });
});
