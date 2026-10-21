// Numeric contract error codes, mirroring `onchain/contracts/lyricsflip/src/errors.rs`
// and the `Error` enum in `onchain/contracts/lyricsflip-nft/src/lib.rs`. The
// codes are stable (see the table in `onchain/README.md`); keep this file in
// sync when a variant is added.

export interface ContractErrorInfo {
  name: string;
  message: string;
}

/**
 * Mapping of numeric error code to contract Error enum variant name for lyricsflip.
 * Stable ABI codes 1..44 matching `onchain/contracts/lyricsflip/src/errors.rs`.
 */
export const CONTRACT_ERROR_NAMES: Record<number, string> = {
  1: 'AlreadyInitialized',
  2: 'NonExistingRound',
  3: 'RoundAlreadyStarted',
  4: 'NonExistingGenre',
  5: 'RoundAlreadyJoined',
  6: 'InvalidCardsPerRound',
  7: 'ArtistCardsIsZero',
  8: 'EmptyYearCards',
  9: 'EmptyGenreCards',
  10: 'RoundNotStarted',
  11: 'RoundCompleted',
  12: 'NotAParticipant',
  13: 'AlreadyReady',
  14: 'NotAuthorized',
  15: 'AmountExceedsLimit',
  16: 'LimitMustBeGreaterThanZero',
  17: 'NonExistingCard',
  18: 'RoundNotReady',
  19: 'RoundAlreadyFinalized',
  20: 'NotEnoughDistinctCards',
  21: 'RoundFull',
  22: 'InvalidMaxPlayers',
  23: 'NftContractNotSet',
  24: 'MilestoneNotReached',
  25: 'MilestoneAlreadyClaimed',
  26: 'InvalidCardTitle',
  27: 'InvalidCardArtist',
  28: 'InvalidCardLyrics',
  29: 'InvalidCardYear',
  30: 'LyricsTooLong',
  31: 'DuplicateCard',
  32: 'BatchTooLarge',
  33: 'NotPendingOwner',
  34: 'NoMoreCards',
  35: 'RoundCancelled',
  36: 'InvalidCardDifficulty',
  37: 'InvalidDecade',
  38: 'NoActiveCard',
  39: 'AlreadyAnswered',
  40: 'Paused',
  41: 'InvalidAnswerWindow',
  42: 'InvalidLobbyTimeout',
  43: 'InvalidRoundDuration',
  44: 'CardInActiveRound',
  45: 'TooManyOpenRounds',
};

/**
 * Hand-written user-friendly UI messages keyed by contract error name.
 */
export const LYRICSFLIP_ERROR_MESSAGES: Record<string, string> = {
  AlreadyInitialized: 'The contract is already initialized.',
  NonExistingRound: 'That round does not exist.',
  RoundAlreadyStarted: 'That round has already started.',
  NonExistingGenre: 'Pick a genre to create a round.',
  RoundAlreadyJoined: 'You have already joined this round.',
  InvalidCardsPerRound: 'Cards per round must be greater than zero.',
  ArtistCardsIsZero: 'There are no cards for that artist yet.',
  EmptyYearCards: 'There are no cards for that year yet.',
  EmptyGenreCards: 'There are no cards for that genre yet.',
  RoundNotStarted: 'That round has not started yet.',
  RoundCompleted: 'That round is already finished.',
  NotAParticipant: 'You are not a player in this round.',
  AlreadyReady: 'You are already marked as ready.',
  NotAuthorized: 'You are not authorized to do that.',
  AmountExceedsLimit: 'Not enough cards to build a round.',
  LimitMustBeGreaterThanZero: 'No cards have been added yet.',
  NonExistingCard: 'That card does not exist.',
  RoundNotReady: 'The round is not ready to be finalized yet.',
  RoundAlreadyFinalized: 'That round has already been finalized.',
  NotEnoughDistinctCards: 'Not enough distinct answers to build a question card.',
  RoundFull: 'That round is full.',
  InvalidMaxPlayers: 'A round needs room for at least 2 players.',
  NftContractNotSet: 'NFT rewards are not configured yet.',
  MilestoneNotReached: 'You have not reached that milestone yet.',
  MilestoneAlreadyClaimed: 'You already claimed that reward.',
  InvalidCardTitle: 'A card needs a title.',
  InvalidCardArtist: 'A card needs an artist.',
  InvalidCardLyrics: 'A card needs lyrics.',
  InvalidCardYear: 'The card year must be between 1900 and this year.',
  LyricsTooLong: 'The lyrics are too long (max 1000 bytes).',
  DuplicateCard: 'A card with that title and artist already exists.',
  BatchTooLarge: 'Too many cards in one batch (max 20).',
  NotPendingOwner: 'You are not the pending owner of this contract.',
  NoMoreCards: 'All cards have been drawn; finalize the round.',
  RoundCancelled: 'That round was cancelled.',
  InvalidCardDifficulty: 'Card difficulty must be 1, 2, or 3.',
  InvalidDecade: 'Choose a decade beginning in a valid year.',
  NoActiveCard: 'No card has been drawn yet for this round.',
  AlreadyAnswered: 'You have already answered this card.',
  Paused: 'The game is temporarily paused.',
  InvalidAnswerWindow: 'The answer window must be between 5 and 180 seconds.',
  InvalidLobbyTimeout: 'The lobby timeout must be between 30 and 86400 seconds.',
  InvalidRoundDuration: 'That round duration or buffer is out of range.',
  CardInActiveRound: 'This card is in an active round and its answer fields cannot change yet.',
  TooManyOpenRounds: 'You already have the maximum number of open lobbies. Start or cancel one first.',
};

/**
 * Builds a numeric error table from a code-to-name mapping and a friendly messages map.
 */
export function buildErrorTable(
  codeToName: Record<number, string>,
  friendlyMessages: Record<string, string>,
): Record<number, ContractErrorInfo> {
  const table: Record<number, ContractErrorInfo> = {};
  for (const [codeStr, name] of Object.entries(codeToName)) {
    const code = Number(codeStr);
    const message = friendlyMessages[name] ?? `Contract error: ${name}`;
    table[code] = { name, message };
  }
  return table;
}

export const LYRICSFLIP_ERRORS: Record<number, ContractErrorInfo> = buildErrorTable(
  CONTRACT_ERROR_NAMES,
  LYRICSFLIP_ERROR_MESSAGES,
);

export const NFT_ERROR_NAMES: Record<number, string> = {
  1: 'AlreadyInitialized',
  2: 'NotMinter',
  3: 'TokenAlreadyExists',
  4: 'TokenDoesNotExist',
  5: 'IncorrectOwner',
  6: 'InsufficientApproval',
  7: 'InvalidLiveUntilLedger',
  8: 'NotOwner',
  9: 'NotPendingOwner',
  10: 'BaseUriTooLong',
  11: 'InsufficientBalance',
};

export const NFT_ERROR_MESSAGES: Record<string, string> = {
  AlreadyInitialized: 'The NFT contract is already initialized.',
  NotMinter: 'Only the minter can mint rewards.',
  TokenAlreadyExists: 'That token has already been minted.',
  TokenDoesNotExist: 'That token does not exist.',
  IncorrectOwner: 'That token is not owned by this account.',
  InsufficientApproval: 'You are not approved to manage that token.',
  InvalidLiveUntilLedger: 'That approval expiry is already in the past.',
  NotOwner: 'Only the contract owner can do that.',
  NotPendingOwner: 'You are not the pending owner of this contract.',
  BaseUriTooLong: 'That base URI is too long.',
  InsufficientBalance: 'Balance is insufficient or missing.',
};

export const LYRICSFLIP_NFT_ERRORS: Record<number, ContractErrorInfo> = buildErrorTable(
  NFT_ERROR_NAMES,
  NFT_ERROR_MESSAGES,
);

/**
 * Extracts the numeric code from a Soroban contract error, which surfaces in
 * simulation/submission messages as `Error(Contract, #<code>)`.
 */
export function getContractErrorCode(error: unknown): number | undefined {
  const text = error instanceof Error ? error.message : String(error);
  const match = /Error\(Contract, #(\d+)\)/.exec(text);
  return match ? Number(match[1]) : undefined;
}

export function describeContractError(
  error: unknown,
  table: Record<number, ContractErrorInfo> = LYRICSFLIP_ERRORS,
): ContractErrorInfo | undefined {
  const code = getContractErrorCode(error);
  return code === undefined ? undefined : table[code];
}

/** True when the user dismissed or declined the signature request in their wallet. */
export function isUserRejection(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /reject|declin|denied|cancel/i.test(text);
}

/**
 * Well-known Horizon REST API and Soroban RPC error strings that indicate
 * wallet/account funding problems. These appear in simulation and submission
 * responses before a contract error code is available.
 *
 * Patterns are tested case-insensitively against the full error message.
 */
const HORIZON_RPC_ERROR_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  // Horizon 404 for an account that doesn't exist on-chain yet
  {
    pattern: /account not found|404.*account|account.*404/i,
    message: 'This account does not exist on-chain yet. Fund it with Friendbot (testnet) or send XLM to it first.',
  },
  // Soroban simulation: source account not found
  {
    pattern: /source account not found/i,
    message: 'Your account has no XLM and cannot be found on-chain. Fund it to continue.',
  },
  // Transaction submission: insufficient balance to cover fee + base reserve
  {
    pattern: /txInsufficientBalance|insufficient balance|insufficient_balance/i,
    message: 'Your XLM balance is too low to cover transaction fees. Add XLM to your wallet.',
  },
  // Horizon result code: fee bump failed due to low fee
  {
    pattern: /txInsufficientFee|insufficient_fee/i,
    message: 'Transaction fee is too low. Try again.',
  },
  // General balance/fee messages from RPC error responses
  {
    pattern: /balance.*insufficient|not enough.*balance|no.*xlm/i,
    message: 'Your XLM balance is too low to complete this transaction.',
  },
  // Soroban ledger entry / TTL errors that can look like account issues
  {
    pattern: /entry.*not found|ledger.*not found/i,
    message: 'An on-chain entry was not found. The account or contract data may be missing.',
  },
];

/**
 * Returns a friendly message when the error text matches a known Horizon or
 * Soroban RPC error pattern, or `undefined` if no pattern matches.
 */
export function parseHorizonRpcError(error: unknown): string | undefined {
  const text = error instanceof Error ? error.message : String(error);
  for (const { pattern, message } of HORIZON_RPC_ERROR_PATTERNS) {
    if (pattern.test(text)) return message;
  }
  return undefined;
}

/**
 * Turns an SDK/wallet error into a message fit for the UI:
 *  1. A known contract error code maps to its friendly message.
 *  2. A declined signature says so.
 *  3. Known Horizon / RPC error strings are mapped to helpful guidance.
 *  4. Anything else falls back to the original message.
 */
export function parseContractError(
  error: unknown,
  table: Record<number, ContractErrorInfo> = LYRICSFLIP_ERRORS,
): { code?: number; message: string } {
  const code = getContractErrorCode(error);
  if (code !== undefined) {
    return { code, message: table[code]?.message ?? `Contract error #${code}.` };
  }
  if (isUserRejection(error)) {
    return { message: 'You rejected the signature request.' };
  }
  const horizonMessage = parseHorizonRpcError(error);
  if (horizonMessage) {
    return { message: horizonMessage };
  }
  const text = error instanceof Error ? error.message : String(error);
  return { message: text || 'Something went wrong.' };
}
