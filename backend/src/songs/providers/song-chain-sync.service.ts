import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { contract } from '@stellar/stellar-sdk';
import { Song } from '../entities/song.entity';
import { genreToWire } from '../enums/genre.enum';
import { SongDifficulty } from '../enums/song-difficulty.enum';

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
  difficulty: number;
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
  difficulty:
    song.difficulty === SongDifficulty.EASY
      ? 1
      : song.difficulty === SongDifficulty.HARD
        ? 3
        : 2,
  lyrics: song.lyrics,
});

/**
 * Builds unsigned `add_cards` transactions for the on-chain card catalogue.
 *
 * The API process deliberately holds **no** secret key (LF-227): it only knows
 * the admin account's *public* key (`SOROBAN_ADMIN_PUBLIC_KEY`) and returns the
 * assembled transaction XDR, which the admin's wallet signs in the admin UI
 * (LF-219) before it is submitted. This keeps the internet-facing API from
 * being able to add, update or remove cards — or, since the deployment scripts
 * make the admin the contract owner, upgrade the contract — if it is
 * compromised.
 *
 * The admin account must be a dedicated, non-owner account holding only the
 * `Admin` role. To rotate it, grant the new account the role and revoke the old
 * one with the contract's `set_role` entry point (called by the owner), then
 * update `SOROBAN_ADMIN_PUBLIC_KEY`. See the LF-243 threat model for the impact
 * of a compromised admin key: an attacker could submit card changes until the
 * role is revoked, but could not upgrade the contract because the admin is not
 * the owner.
 *
 * If server-side signing is ever reintroduced as a stop-gap, it must load the
 * key from a secret manager via a dedicated config provider, never log it, and
 * run in a separate worker process — never in the API container.
 */
@Injectable()
export class SongChainSyncService {
  private readonly logger = new Logger(SongChainSyncService.name);

  constructor(private readonly configService: ConfigService) {}

  // Builds an unsigned transaction for at most MAX_CARDS_PER_BATCH songs and
  // returns its XDR for the admin wallet to sign. The resulting on-chain card
  // ids are only known once the signed transaction is submitted.
  async buildAddCardsTransaction(songs: Song[]): Promise<string> {
    if (songs.length === 0) {
      throw new Error('Cannot build an add_cards transaction with no songs');
    }
    if (songs.length > MAX_CARDS_PER_BATCH) {
      throw new Error(
        `Cannot sync ${songs.length} songs in one batch (max ${MAX_CARDS_PER_BATCH})`,
      );
    }

    const adminPublicKey = this.getAdminPublicKey();
    const client = await this.getContractClient(adminPublicKey);

    this.logger.log(
      `Building unsigned add_cards transaction for ${songs.length} card(s)`,
    );
    const assembled = await client.add_cards({
      caller: adminPublicKey,
      cards: songs.map(songToWireCard),
    });
    return assembled.toXDR();
  }

  private getAdminPublicKey(): string {
    const publicKey = this.configService.get<string>('SOROBAN_ADMIN_PUBLIC_KEY');
    if (!publicKey) {
      throw new Error(
        'SOROBAN_ADMIN_PUBLIC_KEY is not configured (the API must not hold the admin secret key)',
      );
    }
    return publicKey;
  }

  private async getContractClient(publicKey: string) {
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

    // No `signTransaction` is supplied: the transaction is returned unsigned
    // for the admin wallet to sign in the admin UI (LF-219).
    return contract.Client.from<LyricsFlipContract>({
      contractId,
      networkPassphrase,
      rpcUrl,
      publicKey,
    });
  }
}
