import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  SongChainSyncService,
  MAX_CARDS_PER_BATCH,
} from './song-chain-sync.service';
import { Song, SongStatus } from '../entities/song.entity';
import { Genre } from '../enums/genre.enum';

const fakeKeypair = { publicKey: () => 'GADMIN' };
const addCardsMock = jest.fn();

jest.mock('@stellar/stellar-sdk', () => ({
  Keypair: { fromSecret: jest.fn(() => fakeKeypair) },
  contract: {
    Client: { from: jest.fn(() => ({ add_cards: addCardsMock })) },
  },
}));

describe('SongChainSyncService', () => {
  let service: SongChainSyncService;
  let configService: jest.Mocked<ConfigService>;

  const song = (overrides: Partial<Song> = {}): Song =>
    ({
      id: '1',
      title: 'Title',
      artist: 'Artist',
      lyrics: 'la la',
      genre: Genre.Pop,
      year: 1999,
      status: SongStatus.APPROVED,
      ...overrides,
    }) as Song;

  const configValues: Record<string, unknown> = {
    SOROBAN_ADMIN_SECRET_KEY: 'S...secret',
    'soroban.contractIds': ['C...contract'],
    'soroban.rpcUrl': 'https://soroban-testnet.stellar.org',
    'stellar.network': 'testnet',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SongChainSyncService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(SongChainSyncService);
    configService = module.get(ConfigService);
    configService.get.mockImplementation((key: string) => configValues[key]);
  });

  it('returns an empty array without calling the contract for no songs', async () => {
    const result = await service.addCards([]);
    expect(result).toEqual([]);
    expect(addCardsMock).not.toHaveBeenCalled();
  });

  it('rejects a batch larger than MAX_CARDS_PER_BATCH', async () => {
    const songs = Array.from({ length: MAX_CARDS_PER_BATCH + 1 }, () => song());
    await expect(service.addCards(songs)).rejects.toThrow(/max/i);
  });

  it('throws when the admin secret key is not configured', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'SOROBAN_ADMIN_SECRET_KEY' ? undefined : configValues[key],
    );
    await expect(service.addCards([song()])).rejects.toThrow(
      /SOROBAN_ADMIN_SECRET_KEY/,
    );
  });

  it('throws when the contract id is not configured', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'soroban.contractIds' ? [] : configValues[key],
    );
    await expect(service.addCards([song()])).rejects.toThrow(
      /LYRICSFLIP_CONTRACT_ID/,
    );
  });

  it('throws when the network passphrase cannot be resolved', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'stellar.network' ? 'unknown-network' : configValues[key],
    );
    await expect(service.addCards([song()])).rejects.toThrow(/STELLAR_NETWORK/);
  });

  it('submits wire-encoded cards and returns the on-chain ids', async () => {
    addCardsMock.mockResolvedValue({
      signAndSend: jest.fn().mockResolvedValue({ result: [1n, 2n] }),
    });

    const result = await service.addCards([
      song({ id: 'a', genre: Genre.Pop }),
      song({ id: 'b', genre: Genre.Rock }),
    ]);

    expect(result).toEqual([1n, 2n]);
    expect(addCardsMock).toHaveBeenCalledWith({
      caller: 'GADMIN',
      cards: [
        {
          card_id: 0n,
          genre: 1,
          artist: 'Artist',
          title: 'Title',
          year: 1999n,
          lyrics: 'la la',
        },
        {
          card_id: 0n,
          genre: 2,
          artist: 'Artist',
          title: 'Title',
          year: 1999n,
          lyrics: 'la la',
        },
      ],
    });
  });
});
