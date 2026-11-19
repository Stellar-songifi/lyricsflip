// ---------------------------------------------------------------------------
// LyricsFlip contract error codes
// Auto-synced from onchain/contracts/lyricsflip/src/errors.rs
// Never renumber or reuse a code — the numeric values are part of the ABI.
// ---------------------------------------------------------------------------

/** Every numeric error code the LyricsFlip core contract can emit. */
export const enum LyricsFlipErrorCode {
  AlreadyInitialized = 1,
  NonExistingRound = 2,
  RoundAlreadyStarted = 3,
  NonExistingGenre = 4,
  RoundAlreadyJoined = 5,
  InvalidCardsPerRound = 6,
  ArtistCardsIsZero = 7,
  EmptyYearCards = 8,
  EmptyGenreCards = 9,
  RoundNotStarted = 10,
  RoundCompleted = 11,
  NotAParticipant = 12,
  AlreadyReady = 13,
  NotAuthorized = 14,
  AmountExceedsLimit = 15,
  LimitMustBeGreaterThanZero = 16,
  NonExistingCard = 17,
  RoundNotReady = 18,
  RoundAlreadyFinalized = 19,
  NotEnoughDistinctCards = 20,
  RoundFull = 21,
  InvalidMaxPlayers = 22,
  NftContractNotSet = 23,
  MilestoneNotReached = 24,
  MilestoneAlreadyClaimed = 25,
  InvalidCardTitle = 26,
  InvalidCardArtist = 27,
  InvalidCardLyrics = 28,
  InvalidCardYear = 29,
  LyricsTooLong = 30,
  DuplicateCard = 31,
  BatchTooLarge = 32,
  NotPendingOwner = 33,
}

// ---------------------------------------------------------------------------
// LyricsFlip NFT contract error codes
// Auto-synced from onchain/contracts/lyricsflip-nft/src/lib.rs
// ---------------------------------------------------------------------------

/** Every numeric error code the LyricsFlip NFT contract can emit. */
export const enum LyricsFlipNftErrorCode {
  AlreadyInitialized = 1,
  NotMinter = 2,
  TokenAlreadyExists = 3,
  TokenDoesNotExist = 4,
  IncorrectOwner = 5,
  InsufficientApproval = 6,
  InvalidLiveUntilLedger = 7,
  NotOwner = 8,
  NotPendingOwner = 9,
  BaseUriTooLong = 10,
}

// ---------------------------------------------------------------------------
// Shared info type
// ---------------------------------------------------------------------------

export interface ContractErrorInfo {
  name: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Messages maps
//
// The type constraint `Record<LyricsFlipErrorCode, ContractErrorInfo>` means
// tsc will error if any variant of the enum is missing from the map, so an
// unhandled error code is a compile-time failure rather than a silent runtime
// "Error(Contract, #N)".
// ---------------------------------------------------------------------------

export const LYRICSFLIP_ERROR_MESSAGES: Record<
  LyricsFlipErrorCode,
  ContractErrorInfo
> = {
  [LyricsFlipErrorCode.AlreadyInitialized]: {
    name: 'AlreadyInitialized',
    message: 'The contract is already initialized.',
  },
  [LyricsFlipErrorCode.NonExistingRound]: {
    name: 'NonExistingRound',
    message: 'That round does not exist.',
  },
  [LyricsFlipErrorCode.RoundAlreadyStarted]: {
    name: 'RoundAlreadyStarted',
    message: 'That round has already started.',
  },
  [LyricsFlipErrorCode.NonExistingGenre]: {
    name: 'NonExistingGenre',
    message: 'Pick a genre to create a round.',
  },
  [LyricsFlipErrorCode.RoundAlreadyJoined]: {
    name: 'RoundAlreadyJoined',
    message: 'You have already joined this round.',
  },
  [LyricsFlipErrorCode.InvalidCardsPerRound]: {
    name: 'InvalidCardsPerRound',
    message: 'Cards per round must be greater than zero.',
  },
  [LyricsFlipErrorCode.ArtistCardsIsZero]: {
    name: 'ArtistCardsIsZero',
    message: 'There are no cards for that artist yet.',
  },
  [LyricsFlipErrorCode.EmptyYearCards]: {
    name: 'EmptyYearCards',
    message: 'There are no cards for that year yet.',
  },
  [LyricsFlipErrorCode.EmptyGenreCards]: {
    name: 'EmptyGenreCards',
    message: 'There are no cards for that genre yet.',
  },
  [LyricsFlipErrorCode.RoundNotStarted]: {
    name: 'RoundNotStarted',
    message: 'That round has not started yet.',
  },
  [LyricsFlipErrorCode.RoundCompleted]: {
    name: 'RoundCompleted',
    message: 'That round is already finished.',
  },
  [LyricsFlipErrorCode.NotAParticipant]: {
    name: 'NotAParticipant',
    message: 'You are not a player in this round.',
  },
  [LyricsFlipErrorCode.AlreadyReady]: {
    name: 'AlreadyReady',
    message: 'You are already marked as ready.',
  },
  [LyricsFlipErrorCode.NotAuthorized]: {
    name: 'NotAuthorized',
    message: 'You are not authorized to do that.',
  },
  [LyricsFlipErrorCode.AmountExceedsLimit]: {
    name: 'AmountExceedsLimit',
    message: 'Not enough cards to build a round.',
  },
  [LyricsFlipErrorCode.LimitMustBeGreaterThanZero]: {
    name: 'LimitMustBeGreaterThanZero',
    message: 'No cards have been added yet.',
  },
  [LyricsFlipErrorCode.NonExistingCard]: {
    name: 'NonExistingCard',
    message: 'That card does not exist.',
  },
  [LyricsFlipErrorCode.RoundNotReady]: {
    name: 'RoundNotReady',
    message: 'Not all players are ready yet.',
  },
  [LyricsFlipErrorCode.RoundAlreadyFinalized]: {
    name: 'RoundAlreadyFinalized',
    message: 'That round has already been finalized.',
  },
  [LyricsFlipErrorCode.NotEnoughDistinctCards]: {
    name: 'NotEnoughDistinctCards',
    message: 'Not enough distinct answers to build a question card.',
  },
  [LyricsFlipErrorCode.RoundFull]: {
    name: 'RoundFull',
    message: 'That round is full.',
  },
  [LyricsFlipErrorCode.InvalidMaxPlayers]: {
    name: 'InvalidMaxPlayers',
    message: 'A round needs room for at least 2 players.',
  },
  [LyricsFlipErrorCode.NftContractNotSet]: {
    name: 'NftContractNotSet',
    message: 'NFT rewards are not configured yet.',
  },
  [LyricsFlipErrorCode.MilestoneNotReached]: {
    name: 'MilestoneNotReached',
    message: 'You have not reached that milestone yet.',
  },
  [LyricsFlipErrorCode.MilestoneAlreadyClaimed]: {
    name: 'MilestoneAlreadyClaimed',
    message: 'You already claimed that reward.',
  },
  [LyricsFlipErrorCode.InvalidCardTitle]: {
    name: 'InvalidCardTitle',
    message: 'A card needs a title.',
  },
  [LyricsFlipErrorCode.InvalidCardArtist]: {
    name: 'InvalidCardArtist',
    message: 'A card needs an artist.',
  },
  [LyricsFlipErrorCode.InvalidCardLyrics]: {
    name: 'InvalidCardLyrics',
    message: 'A card needs lyrics.',
  },
  [LyricsFlipErrorCode.InvalidCardYear]: {
    name: 'InvalidCardYear',
    message: 'The card year must be between 1900 and this year.',
  },
  [LyricsFlipErrorCode.LyricsTooLong]: {
    name: 'LyricsTooLong',
    message: 'The lyrics are too long (max 1000 bytes).',
  },
  [LyricsFlipErrorCode.DuplicateCard]: {
    name: 'DuplicateCard',
    message: 'A card with that title and artist already exists.',
  },
  [LyricsFlipErrorCode.BatchTooLarge]: {
    name: 'BatchTooLarge',
    message: 'Too many cards in one batch (max 20).',
  },
  [LyricsFlipErrorCode.NotPendingOwner]: {
    name: 'NotPendingOwner',
    message: 'You are not the pending owner of this contract.',
  },
};

export const LYRICSFLIP_NFT_ERROR_MESSAGES: Record<
  LyricsFlipNftErrorCode,
  ContractErrorInfo
> = {
  [LyricsFlipNftErrorCode.AlreadyInitialized]: {
    name: 'AlreadyInitialized',
    message: 'The NFT contract is already initialized.',
  },
  [LyricsFlipNftErrorCode.NotMinter]: {
    name: 'NotMinter',
    message: 'Only the minter can mint rewards.',
  },
  [LyricsFlipNftErrorCode.TokenAlreadyExists]: {
    name: 'TokenAlreadyExists',
    message: 'That token has already been minted.',
  },
  [LyricsFlipNftErrorCode.TokenDoesNotExist]: {
    name: 'TokenDoesNotExist',
    message: 'That token does not exist.',
  },
  [LyricsFlipNftErrorCode.IncorrectOwner]: {
    name: 'IncorrectOwner',
    message: 'That token is not owned by this account.',
  },
  [LyricsFlipNftErrorCode.InsufficientApproval]: {
    name: 'InsufficientApproval',
    message: 'You are not approved to manage that token.',
  },
  [LyricsFlipNftErrorCode.InvalidLiveUntilLedger]: {
    name: 'InvalidLiveUntilLedger',
    message: 'That approval expiry is already in the past.',
  },
  [LyricsFlipNftErrorCode.NotOwner]: {
    name: 'NotOwner',
    message: 'Only the contract owner can do that.',
  },
  [LyricsFlipNftErrorCode.NotPendingOwner]: {
    name: 'NotPendingOwner',
    message: 'You are not the pending owner of this contract.',
  },
  [LyricsFlipNftErrorCode.BaseUriTooLong]: {
    name: 'BaseUriTooLong',
    message: 'That base URI is too long.',
  },
};

// ---------------------------------------------------------------------------
// Contract identity — used to pick the right message table from an error
// ---------------------------------------------------------------------------

export type ContractId = 'lyricsflip' | 'lyricsflip-nft';

/** Map a contract id to its message table. */
const CONTRACT_TABLES: Record<ContractId, Record<number, ContractErrorInfo>> =
  {
    'lyricsflip': LYRICSFLIP_ERROR_MESSAGES as Record<
      number,
      ContractErrorInfo
    >,
    'lyricsflip-nft': LYRICSFLIP_NFT_ERROR_MESSAGES as Record<
      number,
      ContractErrorInfo
    >,
  };

// ---------------------------------------------------------------------------
// Backward-compatible aliases so existing imports continue to compile
// ---------------------------------------------------------------------------

/** @deprecated Use LYRICSFLIP_ERROR_MESSAGES instead. */
export const LYRICSFLIP_ERRORS: Record<number, ContractErrorInfo> =
  LYRICSFLIP_ERROR_MESSAGES as Record<number, ContractErrorInfo>;

/** @deprecated Use LYRICSFLIP_NFT_ERROR_MESSAGES instead. */
export const LYRICSFLIP_NFT_ERRORS: Record<number, ContractErrorInfo> =
  LYRICSFLIP_NFT_ERROR_MESSAGES as Record<number, ContractErrorInfo>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the numeric code from a Soroban contract error, which surfaces in
 * simulation/submission messages as `Error(Contract, #<code>)`.
 */
export function getContractErrorCode(error: unknown): number | undefined {
  const text = error instanceof Error ? error.message : String(error);
  const match = /Error\(Contract, #(\d+)\)/.exec(text);
  return match ? Number(match[1]) : undefined;
}

/**
 * Returns the error info for a known code, optionally scoped to a specific
 * contract so that codes from the NFT contract don't collide with the core one.
 */
export function describeContractError(
  error: unknown,
  tableOrContractId:
    | Record<number, ContractErrorInfo>
    | ContractId = 'lyricsflip',
): ContractErrorInfo | undefined {
  const code = getContractErrorCode(error);
  if (code === undefined) return undefined;
  const table =
    typeof tableOrContractId === 'string'
      ? CONTRACT_TABLES[tableOrContractId]
      : tableOrContractId;
  return table[code];
}

/** True when the user dismissed or declined the signature request in their wallet. */
export function isUserRejection(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /reject|declin|denied|cancel/i.test(text);
}

/**
 * Turns an SDK/wallet error into a message fit for the UI: a known contract
 * error code maps to its friendly message, a declined signature says so, and
 * anything else falls back to the original message.
 *
 * Pass a `ContractId` string to auto-select the right table, or a plain
 * `Record<number, ContractErrorInfo>` for custom tables.
 */
export function parseContractError(
  error: unknown,
  tableOrContractId:
    | Record<number, ContractErrorInfo>
    | ContractId = 'lyricsflip',
): { code?: number; message: string } {
  const code = getContractErrorCode(error);
  if (code !== undefined) {
    const table =
      typeof tableOrContractId === 'string'
        ? CONTRACT_TABLES[tableOrContractId]
        : tableOrContractId;
    return { code, message: table[code]?.message ?? `Contract error #${code}.` };
  }
  if (isUserRejection(error)) {
    return { message: 'You rejected the signature request.' };
  }
  const text = error instanceof Error ? error.message : String(error);
  return { message: text || 'Something went wrong.' };
}
