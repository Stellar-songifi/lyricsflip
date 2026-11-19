// Mirrors `onchain/contracts/lyricsflip/src/types.rs`. Replaces
// `frontend/src/lib/dojo/typescript/models.gen.ts` (Dojo/Cairo codegen).
// Soroban u64/i128 values decode to JS `bigint` via @stellar/stellar-sdk's
// `scValToNative`; u32 values (and "simple" contracttype enums with explicit
// discriminants, like `Genre`/`Role`) decode to a plain `number`.

export type Genre =
  | 'HipHop'
  | 'Pop'
  | 'Rock'
  | 'RnB'
  | 'Electronic'
  | 'Classical'
  | 'Jazz'
  | 'Country'
  | 'Blues'
  | 'Reggae'
  | 'Afrobeat'
  | 'Gospel'
  | 'Folk';

/** Ordering must match the explicit discriminants on `Genre` in `onchain/contracts/lyricsflip/src/types.rs`. */
export const GENRE_VALUES: readonly Genre[] = [
  'HipHop',
  'Pop',
  'Rock',
  'RnB',
  'Electronic',
  'Classical',
  'Jazz',
  'Country',
  'Blues',
  'Reggae',
  'Afrobeat',
  'Gospel',
  'Folk',
];

/** Converts a friendly `Genre` into the `u32` the contract actually expects on the wire. */
export const genreToWire = (genre: Genre): number => GENRE_VALUES.indexOf(genre);

/** Converts a `u32` genre discriminant (as decoded from the contract) back into a friendly `Genre`. */
export const genreFromWire = (value: number): Genre => {
  const genre = GENRE_VALUES[value];
  if (!genre) {
    throw new Error(`Unknown Genre discriminant: ${value}`);
  }
  return genre;
};

/** Matches the single `Role::Admin = 0` variant in the ported contract. */
export const ROLE_ADMIN = 0;

export interface Card {
  card_id: bigint;
  genre: Genre;
  artist: string;
  title: string;
  year: bigint;
  lyrics: string;
}

/** Raw shape returned by the contract, before `genreFromWire` is applied. */
export interface WireCard extends Omit<Card, 'genre'> {
  genre: number;
}

export interface Round {
  round_id: bigint;
  admin: string;
  genre: Genre;
  wager_amount: bigint;
  start_time: bigint;
  is_started: boolean;
  is_completed: boolean;
  end_time: bigint;
  next_card_index: number;
  is_cancelled: boolean;
}

/** Mirrors the contract's `Milestone` enum (encoded as a plain `u32`). */
export const MILESTONES = { FirstWin: 0, Streak5: 1, TenWins: 2 } as const;
export type Milestone = (typeof MILESTONES)[keyof typeof MILESTONES];

/** Raw shape returned by the contract, before `genreFromWire` is applied. */
export interface WireRound extends Omit<Round, 'genre'> {
  genre: number;
}

export interface PlayerStats {
  total_rounds: bigint;
  rounds_won: bigint;
  current_streak: bigint;
  max_streak: bigint;
}

export interface QuestionCard {
  lyric: string;
  timestamp: bigint;
  /** Which attribute the options represent. Matches `QuestionKind` in `onchain/contracts/lyricsflip/src/types.rs`. */
  kind: QuestionKind;
  option_one: string;
  option_two: string;
  option_three: string;
  option_four: string;
}

/**
 * Mirrors `QuestionKind` in `onchain/contracts/lyricsflip/src/types.rs`.
 * Ordering must match the explicit discriminants there.
 * Keep `QUESTION_KIND_VALUES` below in sync.
 */
export type QuestionKind = 'Title' | 'Artist' | 'Year';

/** Ordering must match the explicit discriminants on `QuestionKind` in `onchain/contracts/lyricsflip/src/types.rs`. */
export const QUESTION_KIND_VALUES: readonly QuestionKind[] = ['Title', 'Artist', 'Year'];

/** Converts a friendly `QuestionKind` into the `u32` the contract expects. */
export const questionKindToWire = (kind: QuestionKind): number =>
  QUESTION_KIND_VALUES.indexOf(kind);

/** Converts a `u32` discriminant back into a friendly `QuestionKind`. */
export const questionKindFromWire = (value: number): QuestionKind => {
  const kind = QUESTION_KIND_VALUES[value];
  if (!kind) {
    throw new Error(`Unknown QuestionKind discriminant: ${value}`);
  }
  return kind;
};

export type Answer =
  | { tag: 'Artist'; values: [string] }
  | { tag: 'Year'; values: [bigint] }
  | { tag: 'Title'; values: [string] };

export const Answer = {
  artist: (value: string): Answer => ({ tag: 'Artist', values: [value] }),
  year: (value: bigint | number): Answer => ({ tag: 'Year', values: [BigInt(value)] }),
  title: (value: string): Answer => ({ tag: 'Title', values: [value] }),
};

/**
 * A single answer option shown on the card. The option text lives in
 * `title` for Title and Artist questions (the artist name), and in `title`
 * for Year questions (the year as a string).
 */
export interface SongOption {
  title: string;
  artist: string;
}

/**
 * Maps the selected option to the `Answer` variant matching the question
 * kind (LF-308). The on-chain `Answer` enum carries the real value:
 * `Artist`/`Year` questions submit `Answer.artist`/`Answer.year` instead of
 * the default `Answer.title` the game page used to send.
 */
export const answerForOption = (kind: QuestionKind, option: SongOption): Answer => {
  switch (kind) {
    case 'Artist':
      return Answer.artist(option.title);
    case 'Year':
      return Answer.year(BigInt(option.title));
    case 'Title':
    default:
      return Answer.title(option.title);
  }
};

export interface StellarAccount {
  address: string;
}
