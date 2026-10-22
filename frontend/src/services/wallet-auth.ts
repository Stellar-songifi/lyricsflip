import { post } from './api';
import type { components } from './generated/openapi';
import { clearAuthTokens } from './api';

// Talks to the backend's wallet-based auth endpoints (backend/src/auth/auth.controller.ts
// `challenge`/`verify`). NEXT_PUBLIC_API_URL must point at the bare backend
// origin (e.g. `http://localhost:4000`) - the backend has no `/api` prefix.

type Schemas = components['schemas'];

/** Nonce string to sign with the wallet (e.g. StellarWalletsKit.signMessage). */
export type WalletChallengeResponse = Schemas['WalletChallengeResponse'];

export type WalletAuthTokens = Schemas['WalletAuthTokens'];

/** Requests a one-time challenge for `address` to sign with its Stellar wallet. */
export const requestWalletChallenge = (
  address: string,
): Promise<WalletChallengeResponse> =>
  post<WalletChallengeResponse>('/auth/challenge', { address });

/**
 * Verifies a signed challenge and returns the access token for the
 * (upserted) account tied to that Stellar address. The refresh token is set
 * as an HttpOnly cookie by the backend (LF-202) and never reaches JS.
 */
export const verifyWalletChallenge = (
  address: string,
  signedChallenge: string,
): Promise<WalletAuthTokens> =>
  post<WalletAuthTokens>('/auth/verify', { address, signedChallenge });

/**
 * Storage keys that hold wallet-scoped identity/auth state. These must be
 * cleared whenever the connected wallet address changes or the wallet is
 * disconnected, otherwise stale JWTs stay tied to the previous account.
 */
const WALLET_SCOPED_STORAGE_KEYS = [
  'walletAddress',
  'wallet_address',
  'walletAuthTokens',
  'walletChallenge',
  'walletChallengeExpiresAt',
] as const;

/**
 * Clears all wallet-scoped auth state: the access/refresh tokens plus any
 * cached wallet identity. Safe to call in the browser; a no-op on the server.
 */
export const resetWalletAuth = (): void => {
  clearAuthTokens();

  if (typeof window === 'undefined') return;

  try {
    for (const key of WALLET_SCOPED_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable (private mode, quota, etc.) - ignore.
  }
};
