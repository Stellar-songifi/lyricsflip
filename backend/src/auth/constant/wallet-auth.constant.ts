/** Redis key prefix for pending wallet-auth challenges (see WalletAuthProvider). */
export const WALLET_CHALLENGE_KEY_PREFIX = 'wallet-auth:challenge:';

/** How long a wallet-auth challenge stays valid, in seconds. */
export const WALLET_CHALLENGE_TTL_SECONDS = 5 * 60;
