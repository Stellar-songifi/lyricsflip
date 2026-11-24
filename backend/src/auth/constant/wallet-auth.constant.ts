/** Redis key prefix for pending wallet-auth challenges (see WalletAuthProvider). */
export const WALLET_CHALLENGE_KEY_PREFIX = 'wallet-auth:challenge:';

/** How long a wallet-auth challenge stays valid, in seconds. */
export const WALLET_CHALLENGE_TTL_SECONDS = 5 * 60;

/** Redis key prefix for per-address challenge-issuance counters. */
export const WALLET_CHALLENGE_RATE_KEY_PREFIX = 'wallet-auth:challenge-rate:';

/** Window, in seconds, over which per-address challenge requests are counted. */
export const WALLET_CHALLENGE_RATE_WINDOW_SECONDS = 60;

/** Max challenges issued per address within the window. */
export const WALLET_CHALLENGE_MAX_PER_ADDRESS = 5;
