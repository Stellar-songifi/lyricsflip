import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair, contract } from '@stellar/stellar-sdk';
import { Song } from '../entities/song.entity';
import { genreToWire } from '../enums/genre.enum';

/** The contract rejects a batch larger than this (see `MAX_CARDS_PER_BATCH` in `onchain/contracts/lyricsflip/src/lib.rs`). */
export const MAX_CARDS_PER_BATCH = 20;

/** Well-known Stellar network passphrases, keyed by `STELLAR_NETWORK`. */
const NETWORK_PASSPHRASES: Record<string, string> = {
  testnet: 'Test SDF Network ; September 2015',
  futurenet: 'Test SDF Future Network ; October 2022',
  mainnet: 'Public Global Stellar Network ; September 2015',
};

interface WireCard {
  card_id: bigint;
  genre: number;
  artist: string;
  title: string;
  year: bigint;
  lyrics: string;
}

/** Only the subset of the deployed contract's interface this service calls. */
interface LyricsFlipContract {
  add_cards: (args: {
    caller: string;
    cards: WireCard[];
  }) => Promise<contract.AssembledTransaction<bigint[]>>;
}

const songToWireCard = (song: Song): WireCard => ({
  card_id: BigInt(0),
  genre: genreToWire(song.genre),
  artist: song.artist,
  title: song.title,
  year: BigInt(song.year),
  lyrics: song.lyrics,
});

/**
 * Submits approved songs to the on-chain card catalogue by calling the
 * contract's `add_cards` as the admin account. The admin secret key is read
 * from the environment (`SOROBAN_ADMIN_SECRET_KEY`), which in a real
 * deployment is injected from a secret manager rather than committed
 * anywhere — see LF-090's acceptance criteria.
 */
@Injectable()
export class SongChainSyncService {
  private readonly logger = new Logger(SongChainSyncService.name);

  constructor(private readonly configService: ConfigService) {}

  // Submits at most MAX_CARDS_PER_BATCH songs and returns their on-chain
  // card ids, in the same order the songs were given.
  async addCards(songs: Song[]): Promise<bigint[]> {
    if (songs.length === 0) return [];
    if (songs.length > MAX_CARDS_PER_BATCH) {
      throw new Error(
        `Cannot sync ${songs.length} songs in one batch (max ${MAX_CARDS_PER_BATCH})`,
      );
    }

    const keypair = this.getAdminKeypair();
    const client = await this.getContractClient(keypair);

    this.logger.log(`Submitting ${songs.length} card(s) to the contract`);
    const assembled = await client.add_cards({
      caller: keypair.publicKey(),
      cards: songs.map(songToWireCard),
    });
    const sent = await assembled.signAndSend();
    return sent.result;
  }

  private getAdminKeypair(): Keypair {
    const secret = this.configService.get<string>('SOROBAN_ADMIN_SECRET_KEY');
    if (!secret) {
      throw new Error(
        'SOROBAN_ADMIN_SECRET_KEY is not configured (expected to come from a secret manager)',
      );
    }
    return Keypair.fromSecret(secret);
  }

  private async getContractClient(keypair: Keypair) {
    const [contractId] =
      this.configService.get<string[]>('soroban.contractIds') ?? [];
    if (!contractId) {
      throw new Error('LYRICSFLIP_CONTRACT_ID is not configured');
    }
    const rpcUrl = this.configService.get<string>('soroban.rpcUrl');
    if (!rpcUrl) {
      throw new Error('SOROBAN_RPC_URL (or STELLAR_RPC_URL) is not configured');
    }
    const network = this.configService.get<string>('stellar.network');
    const networkPassphrase = network && NETWORK_PASSPHRASES[network];
    if (!networkPassphrase) {
      throw new Error(`Unknown or unconfigured STELLAR_NETWORK: "${network}"`);
    }

    return contract.Client.from<LyricsFlipContract>({
      contractId,
      networkPassphrase,
      rpcUrl,
      publicKey: keypair.publicKey(),
      // The SDK accepts a bare Keypair as a signer (see KeypairSigner).
      signTransaction: keypair,
    });
  }
}
