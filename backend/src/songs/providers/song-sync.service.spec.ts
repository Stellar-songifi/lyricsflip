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
        {
          provide: SongChainSyncService,
          useValue: { buildAddCardsTransaction: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<SongSyncService>(SongSyncService);
    songsService = module.get(SongsService);
    chainSyncService = module.get(SongChainSyncService);
  });

  it('does nothing when there are no approved songs', async () => {
    songsService.findByStatus.mockResolvedValue([]);

    const result = await service.buildPublishBatches();

    expect(chainSyncService.buildAddCardsTransaction).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 0, batches: [] });
  });

  it('builds one unsigned batch and reports the song ids it covers', async () => {
    const songs = [makeSong('a'), makeSong('b')];
    songsService.findByStatus.mockResolvedValue(songs);
    chainSyncService.buildAddCardsTransaction.mockResolvedValue('xdr-batch');

    const result = await service.buildPublishBatches();

    expect(chainSyncService.buildAddCardsTransaction).toHaveBeenCalledWith(
      songs,
    );
    expect(result).toEqual({
      total: 2,
      batches: [{ xdr: 'xdr-batch', songIds: ['a', 'b'] }],
    });
  });

  it('splits more than MAX_CARDS_PER_BATCH songs into multiple batches', async () => {
    const songs = Array.from({ length: MAX_CARDS_PER_BATCH + 5 }, (_, i) =>
      makeSong(`s${i}`),
    );
    songsService.findByStatus.mockResolvedValue(songs);
    chainSyncService.buildAddCardsTransaction.mockResolvedValue('xdr');

    const result = await service.buildPublishBatches();

    expect(chainSyncService.buildAddCardsTransaction).toHaveBeenCalledTimes(2);
    expect(
      chainSyncService.buildAddCardsTransaction.mock.calls[0][0],
    ).toHaveLength(MAX_CARDS_PER_BATCH);
    expect(
      chainSyncService.buildAddCardsTransaction.mock.calls[1][0],
    ).toHaveLength(5);
    expect(result.total).toBe(MAX_CARDS_PER_BATCH + 5);
    expect(result.batches).toHaveLength(2);
  });
});
