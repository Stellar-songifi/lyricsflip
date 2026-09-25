import { post } from './api';

// Talks to the backend's wallet-based auth endpoints (backend/src/auth/auth.controller.ts
// `challenge`/`verify`). NEXT_PUBLIC_API_URL must point at the bare backend
// origin (e.g. `http://localhost:4000`) - the backend has no `/api` prefix.

export interface WalletChallengeResponse {
  /** Nonce string to sign with the wallet (e.g. StellarWalletsKit.signMessage). */
  challenge: string;
  /** How long the challenge stays valid, in seconds. */
  expiresIn: number;
}

export interface WalletAuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Requests a one-time challenge for `address` to sign with its Stellar wallet. */
export const requestWalletChallenge = (
  address: string,
): Promise<WalletChallengeResponse> =>
  post<WalletChallengeResponse>('/auth/challenge', { address });

/**
 * Verifies a signed challenge and returns access/refresh tokens for the
 * (upserted) account tied to that Stellar address.
 */
export const verifyWalletChallenge = (
  address: string,
  signedChallenge: string,
): Promise<WalletAuthTokens> =>
  post<WalletAuthTokens>('/auth/verify', { address, signedChallenge });
