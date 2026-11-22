/**
 * LF-353: Unified database + on-chain seeder.
 *
 * Reads a single source of truth — `seed/songs.json` — and:
 *   1. Upserts every entry into the `songs` table (by artist+title).
 *   2. Computes the on-chain idempotency key for each card:
 *      sha256(ascii_lower(title) + 0x00 + ascii_lower(artist)).
 *   3. Queries the contract for which cards already exist (by key) and
 *      skips them — so running the seed twice produces no duplicates.
 *   4. Pushes new cards to the chain in batches of MAX_CARDS_PER_BATCH via
 *      the Stellar CLI (`stellar contract invoke`), the same interface
 *      `onchain/scripts/seed-cards.sh` uses.
 *   5. Writes back each returned card_id to the database
 *      (songs.on_chain_card_id, songs.status = 'on_chain').
 *
 * Usage:
 *   DATABASE_URL=postgres://... SOROBAN_ADMIN_SECRET_KEY=S...
 *   LYRICSFLIP_CONTRACT_ID=C... STELLAR_NETWORK=testnet
 *   npm run seed:unified
 *
 * When SOROBAN_ADMIN_SECRET_KEY (or LYRICSFLIP_CONTRACT_ID) is absent the
 * script seeds only the database and skips the chain step gracefully.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeedSong {
  genre: number;
  artist: string;
  title: string;
  year: number;
  lyrics: string;
  source: string;
  license: string;
}

export interface SeedResult {
  /** Songs present in the seed file. */
  total: number;
  /** Songs inserted or updated in the database. */
  dbUpserted: number;
  /** Songs already on the chain (skipped). */
  chainSkipped: number;
  /** Songs newly pushed to the chain. */
  chainPushed: number;
  /** Songs whose on_chain_card_id was written back to the database. */
  cardIdsWrittenBack: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum snippet length allowed by docs/content-policy.md. */
export const MAX_SNIPPET_WORDS = 20;

/** Maximum batch size the contract accepts (see MAX_CARDS_PER_BATCH in lib.rs). */
export const MAX_CARDS_PER_BATCH = 20;

/** Network passphrases keyed by STELLAR_NETWORK. */
const NETWORK_PASSPHRASES: Record<string, string> = {
  testnet: 'Test SDF Network ; September 2015',
  futurenet: 'Test SDF Future Network ; October 2022',
  mainnet: 'Public Global Stellar Network ; September 2015',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Loads and validates the shared seed file. */
export function loadSeedSongs(
  file = resolve(__dirname, '../../../seed/songs.json'),
): SeedSong[] {
  const songs: SeedSong[] = JSON.parse(readFileSync(file, 'utf8'));
  for (const song of songs) {
    if (!song.source) {
      throw new Error(`"${song.title}" is missing a source attribution`);
    }
    if (song.lyrics.split(/\s+/).length > MAX_SNIPPET_WORDS) {
      throw new Error(`"${song.title}" exceeds ${MAX_SNIPPET_WORDS} words`);
    }
  }
  return songs;
}

/**
 * Computes the on-chain idempotency key for a card, matching the contract's
 * `card_key` function: sha256(ascii_lower(title) + 0x00 + ascii_lower(artist)).
 *
 * This key is what the contract uses for duplicate detection (DuplicateCard
 * error). By computing it client-side we can skip cards that are already
 * on the chain without making a contract call that would throw.
 */
export function cardFingerprint(song: Pick<SeedSong, 'title' | 'artist'>): string {
  const buf = Buffer.concat([
    Buffer.from(song.title.toLowerCase(), 'utf8'),
    Buffer.from([0x00]),
    Buffer.from(song.artist.toLowerCase(), 'utf8'),
  ]);
  return createHash('sha256').update(buf).digest('hex');
}

/** Builds the Stellar CLI network arguments for the given network. */
function networkArgs(network: string): string[] {
  if (network === 'local') {
    return [
      '--rpc-url', process.env.LOCAL_RPC_URL ?? 'http://localhost:8000/soroban/rpc',
      '--network-passphrase',
      process.env.LOCAL_NETWORK_PASSPHRASE ?? 'Standalone Network ; February 2017',
    ];
  }
  return ['--network', network];
}

/**
 * Invokes `get_cards_count` on the contract to get the total number of cards,
 * then reads each card via `get_card` and returns the set of fingerprints
 * already on the chain.
 *
 * Falls back to an empty set if the contract call fails (e.g. no contract
 * configured), so the seed can proceed in DB-only mode.
 */
function getExistingChainFingerprints(
  contractId: string,
  network: string,
  identity: string,
): Set<string> {
  try {
    const args = networkArgs(network);
    const countStr = execFileSync(
      'stellar',
      [
        'contract', 'invoke', '--id', contractId, '--source', identity,
        ...args,
        '--', 'get_cards_count',
      ],
      { encoding: 'utf8', timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();
    const count = parseInt(countStr.replace(/\D/g, ''), 10) || 0;
    if (count === 0) return new Set();

    const fingerprints = new Set<string>();
    // Read each card to get its (title, artist) and compute the fingerprint.
    for (let i = 1; i <= count; i++) {
      try {
        const cardJson = execFileSync(
          'stellar',
          [
            'contract', 'invoke', '--id', contractId, '--source', identity,
            ...args,
            '--', 'get_card',
            '--card_id', String(i),
          ],
          { encoding: 'utf8', timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] },
        ).trim();
        // The CLI returns a JSON-ish struct; extract title and artist.
        const titleMatch = cardJson.match(/"title"\s*:\s*"([^"]*)"/i);
        const artistMatch = cardJson.match(/"artist"\s*:\s*"([^"]*)"/i);
        if (titleMatch && artistMatch) {
          fingerprints.add(
            cardFingerprint({ title: titleMatch[1], artist: artistMatch[1] }),
          );
        }
      } catch {
        // Card might have been soft-removed; skip.
        continue;
      }
    }
    return fingerprints;
  } catch {
    // Contract not reachable or CLI not installed — proceed in DB-only mode.
    return new Set();
  }
}

/**
 * Pushes a batch of cards to the chain via `stellar contract invoke add_cards`
 * and returns the on-chain card IDs the contract assigned.
 *
 * Falls back to single-card `add_card` calls if `add_cards` is not available.
 */
function pushCardsToChain(
  songs: SeedSong[],
  contractId: string,
  network: string,
  identity: string,
): string[] {
  const args = networkArgs(network);
  const callerAddress = execFileSync(
    'stellar', ['keys', 'address', identity],
    { encoding: 'utf8', timeout: 10_000 },
  ).trim();

  const cardIds: string[] = [];

  for (const song of songs) {
    const cardStruct = JSON.stringify({
      card_id: 0,
      genre: song.genre,
      artist: song.artist,
      title: song.title,
      year: song.year,
      lyrics: song.lyrics,
    });

    let cardId: string;
    try {
      // Try add_cards (batch call) with a single card.
      const out = execFileSync(
        'stellar',
        [
          'contract', 'invoke', '--id', contractId, '--source', identity,
          ...args,
          '--', 'add_cards',
          '--caller', callerAddress,
          '--cards', `[${cardStruct}]`,
        ],
        { encoding: 'utf8', timeout: 60_000, stdio: ['pipe', 'pipe', 'pipe'] },
      ).trim();
      // Parse the returned u64 array — the CLI prints the first id.
      cardId = out.replace(/\D/g, '');
    } catch {
      // Fallback: add_card (single card call).
      const out = execFileSync(
        'stellar',
        [
          'contract', 'invoke', '--id', contractId, '--source', identity,
          ...args,
          '--', 'add_card',
          '--caller', callerAddress,
          '--card', cardStruct,
        ],
        { encoding: 'utf8', timeout: 60_000, stdio: ['pipe', 'pipe', 'pipe'] },
      ).trim();
      cardId = out.replace(/\D/g, '');
    }

    cardIds.push(cardId);
  }

  return cardIds;
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

/**
 * Seeds the database and the chain from a single source.
 *
 * @param opts Optional overrides for testing.
 */
export async function seedUnified(opts?: {
  dataSource?: DataSource;
  songs?: SeedSong[];
  contractId?: string;
  network?: string;
  identity?: string;
  skipChain?: boolean;
}): Promise<SeedResult> {
  const songs = opts?.songs ?? loadSeedSongs();

  // ----- Step 1: Database upsert -----
  const dataSource =
    opts?.dataSource ??
    new DataSource({ type: 'postgres', url: process.env.DATABASE_URL });
  const shouldCloseDS = !opts?.dataSource;

  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  let dbUpserted = 0;
  for (const s of songs) {
    const result = await dataSource.query(
      `INSERT INTO songs (genre, artist, title, year, lyrics, source, license, difficulty, status, "playCount")
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'medium', 'draft', 0)
       ON CONFLICT (artist, title) DO UPDATE
       SET genre = EXCLUDED.genre, year = EXCLUDED.year, lyrics = EXCLUDED.lyrics,
           source = EXCLUDED.source, license = EXCLUDED.license
       RETURNING id`,
      [
        // Map the seed genre number to the Genre enum string.
        genreNumToEnum(s.genre),
        s.artist,
        s.title,
        s.year,
        s.lyrics,
        s.source,
        s.license,
      ],
    );
    if (result.length > 0) dbUpserted++;
  }

  // ----- Step 2: Determine chain configuration -----
  const contractId =
    opts?.contractId ??
    process.env.LYRICSFLIP_CONTRACT_ID ??
    process.env.NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID;
  const network = opts?.network ?? process.env.STELLAR_NETWORK ?? 'testnet';
  const identity = opts?.identity ?? 'me';
  const skipChain = opts?.skipChain ?? (!contractId || !process.env.SOROBAN_ADMIN_SECRET_KEY);

  if (skipChain) {
    console.log(
      contractId
        ? 'Chain step skipped (SOROBAN_ADMIN_SECRET_KEY not set). Database seeded only.'
        : 'Chain step skipped (LYRICSFLIP_CONTRACT_ID not set). Database seeded only.',
    );
    if (shouldCloseDS) await dataSource.destroy();
    return {
      total: songs.length,
      dbUpserted,
      chainSkipped: 0,
      chainPushed: 0,
      cardIdsWrittenBack: 0,
    };
  }

  // ----- Step 3: Check which cards already exist on the chain -----
  console.log(`Checking ${songs.length} cards against the chain…`);
  const existingFingerprints = getExistingChainFingerprints(
    contractId!,
    network,
    identity,
  );

  const toPush: SeedSong[] = [];
  let chainSkipped = 0;
  for (const song of songs) {
    const fp = cardFingerprint(song);
    if (existingFingerprints.has(fp)) {
      chainSkipped++;
    } else {
      toPush.push(song);
    }
  }

  console.log(
    `${chainSkipped} card(s) already on chain — skipping. ${toPush.length} to push.`,
  );

  // ----- Step 4: Push to chain in batches -----
  let cardIdsWrittenBack = 0;

  for (let i = 0; i < toPush.length; i += MAX_CARDS_PER_BATCH) {
    const batch = toPush.slice(i, i + MAX_CARDS_PER_BATCH);
    console.log(
      `  Pushing batch ${Math.floor(i / MAX_CARDS_PER_BATCH) + 1}/${Math.ceil(toPush.length / MAX_CARDS_PER_BATCH)} (${batch.length} cards)`,
    );

    const cardIds = pushCardsToChain(batch, contractId!, network, identity);

    // ----- Step 5: Write back card_ids to the database -----
    for (let j = 0; j < batch.length; j++) {
      const song = batch[j];
      const cardId = cardIds[j];
      if (cardId) {
        await dataSource.query(
          `UPDATE songs SET "onChainCardId" = $1, status = 'on_chain'
           WHERE artist = $2 AND title = $3`,
          [cardId, song.artist, song.title],
        );
        cardIdsWrittenBack++;
      }
    }
  }

  console.log(
    `Seed complete: ${dbUpserted} in DB, ${chainSkipped} skipped on chain, ${toPush.length} pushed, ${cardIdsWrittenBack} card IDs written back.`,
  );

  if (shouldCloseDS) await dataSource.destroy();

  return {
    total: songs.length,
    dbUpserted,
    chainSkipped,
    chainPushed: toPush.length,
    cardIdsWrittenBack,
  };
}

// ---------------------------------------------------------------------------
// Genre number → Genre enum string (matches the Genre enum order in the contract)
// ---------------------------------------------------------------------------

const GENRE_NAMES = [
  'HipHop', 'Pop', 'Rock', 'RnB', 'Electronic',
  'Classical', 'Jazz', 'Country', 'Blues', 'Reggae',
  'Afrobeat', 'Gospel', 'Folk',
];

function genreNumToEnum(num: number): string {
  if (num < 0 || num >= GENRE_NAMES.length) {
    throw new Error(`Unknown genre number: ${num}`);
  }
  return GENRE_NAMES[num];
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  seedUnified().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
