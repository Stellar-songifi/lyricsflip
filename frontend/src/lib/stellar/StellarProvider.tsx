'use client';

// Replaces `frontend/src/lib/dojo/DojoProvider.tsx`. Dojo's burner-wallet
// manager (an ephemeral local keypair auto-funded on a dev chain) has no
// Stellar equivalent for a production dApp; wallet connectivity is handled
// by `@creit.tech/stellar-wallets-kit` instead, which talks to a real
// browser wallet (Freighter, xBull, Albedo, Lobstr, Hana).

import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { StellarWalletsKit, Networks as KitNetworks } from '@creit.tech/stellar-wallets-kit';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';
import { HanaModule } from '@creit.tech/stellar-wallets-kit/modules/hana';
import { createConfig, type StellarConfig } from './stellarConfig';
import { createSystemCalls, type SystemCalls } from './client';
import type { StellarAccount } from './types';
import { requestWalletChallenge, verifyWalletChallenge } from '../../services/wallet-auth';
import { setAuthTokens, clearAuthTokens } from '../../services/api';

export interface StellarSetupResult {
  systemCalls: SystemCalls;
  account: StellarAccount | null;
}

export interface StellarContextType {
  setup: StellarSetupResult | null;
  account: StellarAccount | null;
  isLoading: boolean;
  error: Error | null;
  warnings: string[];
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** True once `connect()` has exchanged a signed challenge for a backend JWT (see services/api's setAuthTokens). */
  isAuthenticated: boolean;
  /** Set if the wallet connected but backend auth failed; on-chain features still work without it. */
  authError: Error | null;
}

const StellarContext = createContext<StellarContextType>({
  setup: null,
  account: null,
  isLoading: true,
  error: null,
  warnings: [],
  connect: async () => {},
  disconnect: async () => {},
  isAuthenticated: false,
  authError: null,
});

const networkPassphraseToKitNetwork = (passphrase: string): KitNetworks => {
  const match = (Object.values(KitNetworks) as string[]).find((value) => value === passphrase);
  return (match as KitNetworks) ?? KitNetworks.TESTNET;
};

export const StellarProvider = ({ children }: { children: React.ReactNode }) => {
  const configRef = useRef<StellarConfig>(createConfig());
  const [account, setAccount] = useState<StellarAccount | null>(null);
  const [systemCalls, setSystemCalls] = useState<SystemCalls | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<Error | null>(null);
  const hasInit = useRef(false);

  const rebuildSystemCalls = useCallback((address: string | null) => {
    setSystemCalls(createSystemCalls(configRef.current, address));
  }, []);

  // Signs a challenge with the connected wallet and exchanges it for a JWT
  // (see backend/src/auth/providers/wallet-auth.provider.ts), storing it via
  // services/api's setAuthTokens (which the shared axios client already
  // attaches to every request, and refreshes on expiry). Separate from
  // `connect()`'s try/catch: a wallet can connect fine even if this fails
  // (e.g. the wallet doesn't support message signing, or the API is down),
  // and on-chain features don't depend on it.
  const authenticate = useCallback(async (address: string) => {
    setAuthError(null);
    try {
      const { challenge } = await requestWalletChallenge(address);
      const { signedMessage } = await StellarWalletsKit.signMessage(challenge, { address });
      const tokens = await verifyWalletChallenge(address, signedMessage);
      setAuthTokens(tokens.accessToken, tokens.refreshToken);
      setIsAuthenticated(true);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err : new Error('Failed to authenticate with the backend'),
      );
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const { address } = await StellarWalletsKit.authModal();
      setAccount({ address });
      rebuildSystemCalls(address);
      await authenticate(address);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to connect wallet'));
    }
  }, [rebuildSystemCalls, authenticate]);

  const disconnect = useCallback(async () => {
    try {
      await StellarWalletsKit.disconnect();
    } finally {
      setAccount(null);
      rebuildSystemCalls(null);
      setIsAuthenticated(false);
      setAuthError(null);
      clearAuthTokens();
    }
  }, [rebuildSystemCalls]);

  useEffect(() => {
    if (hasInit.current) return;
    hasInit.current = true;

    const config = configRef.current;
    const newWarnings: string[] = [];
    if (!config.lyricsflipContractId) {
      newWarnings.push(
        'NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID is not set - on-chain calls will fail until it is configured.',
      );
    }
    if (!config.lyricsflipNftContractId) {
      newWarnings.push(
        'NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID is not set - NFT minting will fail until it is configured.',
      );
    }
    setWarnings(newWarnings);

    try {
      StellarWalletsKit.init({
        network: networkPassphraseToKitNetwork(config.networkPassphrase),
        modules: [
          new FreighterModule(),
          new xBullModule(),
          new AlbedoModule(),
          new LobstrModule(),
          new HanaModule(),
        ],
      });

      // Read-only calls work without a connected wallet (Soroban simulation
      // falls back to an impossible/null source account), so system calls
      // are ready immediately; mutating calls check for a connected account
      // themselves (see `createSystemCalls`'s `requireAccount`).
      rebuildSystemCalls(null);

      StellarWalletsKit.getAddress()
        .then(({ address }) => {
          if (address) {
            setAccount({ address });
            rebuildSystemCalls(address);
            // Not re-running `authenticate()` here: a leftover JWT in
            // localStorage (see services/api.ts) still gets attached to API
            // calls by its own interceptor regardless of this component's
            // state, and re-signing on every reload would need a user
            // gesture most wallets won't grant silently anyway. `isAuthenticated`
            // just starts false again until the user calls `connect()`.
          }
        })
        .catch(() => {
          // No wallet connected yet; expected on first load.
        });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to initialize Stellar wallet kit'));
    } finally {
      setIsLoading(false);
    }
  }, [rebuildSystemCalls]);

  const contextValue: StellarContextType = {
    setup: systemCalls ? { systemCalls, account } : null,
    account,
    isLoading,
    error,
    warnings,
    connect,
    disconnect,
    isAuthenticated,
    authError,
  };

  return <StellarContext.Provider value={contextValue}>{children}</StellarContext.Provider>;
};

export { StellarContext };
