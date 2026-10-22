'use client';

// Replaces `frontend/src/lib/dojo/DojoProvider.tsx`. Dojo's burner-wallet
// manager (an ephemeral local keypair auto-funded on a dev chain) has no
// Stellar equivalent for a production dApp; wallet connectivity is handled
// by `@creit.tech/stellar-wallets-kit` instead, which talks to a real
// browser wallet (Freighter, xBull, Albedo, Lobstr, Hana).

import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { StellarWalletsKit, Networks as KitNetworks } from '@creit.tech/stellar-wallets-kit';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';
import { HanaModule } from '@creit.tech/stellar-wallets-kit/modules/hana';
import { createConfig, type StellarConfig } from './stellar-config';
import { createSystemCalls, type SystemCalls } from './client';
import type { StellarAccount } from './types';
import { StrKey } from '@stellar/stellar-sdk';
import { ConfigErrorScreen } from '@/components/organisms/config-error-screen';
import { requestWalletChallenge, verifyWalletChallenge } from '../../services/wallet-auth';
import { setAuthTokens, logout, restoreSession } from '../../services/api';
import { toast } from '@/components/ui/toast';

/** How often to poll the wallet for an address change, in milliseconds. */
const ADDRESS_POLL_INTERVAL_MS = 5000;

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
  /** True once the user holds a backend JWT: from `connect()`'s signed challenge, or restored from the refresh cookie on reload. */
  isAuthenticated: boolean;
  /** Set if the wallet connected but backend auth failed; on-chain features still work without it. */
  authError: Error | null;
  /** True once the reload-time session restore (refresh cookie) has finished, so guards can decide. */
  isSessionChecked: boolean;
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
  isSessionChecked: false,
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
  const [isSessionChecked, setIsSessionChecked] = useState(false);
  const hasInit = useRef(false);
  const queryClient = useQueryClient();
  // Mirrors `account` for the polling effect, which must not re-subscribe
  // (and thus reset its interval) every time the account changes.
  const accountRef = useRef<StellarAccount | null>(null);
  accountRef.current = account;

  const rebuildSystemCalls = useCallback((address: string | null) => {
    setSystemCalls(createSystemCalls(configRef.current, address));
  }, []);

  // Signs a challenge with the connected wallet and exchanges it for a JWT
  // (see backend/src/auth/providers/wallet-auth.provider.ts), keeping it in
  // memory via services/api's setAuthTokens (the shared axios client attaches
  // it to every request and refreshes it from the HttpOnly cookie on expiry).
  // Separate from
  // `connect()`'s try/catch: a wallet can connect fine even if this fails
  // (e.g. the wallet doesn't support message signing, or the API is down),
  // and on-chain features don't depend on it.
  const authenticate = useCallback(async (address: string) => {
    setAuthError(null);
    try {
      const { challenge } = await requestWalletChallenge(address);
      const { signedMessage } = await StellarWalletsKit.signMessage(challenge, { address });
      const tokens = await verifyWalletChallenge(address, signedMessage);
      setAuthTokens(tokens.accessToken);
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
      void logout();
      queryClient.clear();
    }
  }, [rebuildSystemCalls, queryClient]);

  // Called when the wallet reports a different address than the one we have
  // (or no address at all). Everything derived from the old account — system
  // calls, cached queries, backend JWTs — is tied to that address, so it all
  // has to go before the new address is used.
  const handleAddressChange = useCallback(
    (nextAddress: string | null) => {
      const previousAddress = accountRef.current?.address ?? null;
      if (nextAddress === previousAddress) return;

      setAccount(nextAddress ? { address: nextAddress } : null);
      rebuildSystemCalls(nextAddress);
      setIsAuthenticated(false);
      setAuthError(null);
      void logout();
      queryClient.clear();

      if (nextAddress) {
        toast({
          title: 'Wallet account changed',
          description: `Now using ${nextAddress.slice(0, 4)}…${nextAddress.slice(-4)}.`,
        });
      } else {
        toast({
          title: 'Wallet disconnected',
          description: 'Your wallet is no longer connected.',
        });
      }
    },
    [rebuildSystemCalls, queryClient],
  );

  useEffect(() => {
    if (hasInit.current) return;
    hasInit.current = true;

    const config = configRef.current;
    const newWarnings: string[] = [];
    if (!config.lyricsflipContractId) {
      newWarnings.push(
        'NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID is not set - on-chain calls will fail until it is configured.',
      );
    } else if (!StrKey.isValidContract(config.lyricsflipContractId)) {
      newWarnings.push(
        'NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID is invalid - contract ID must be a valid C... StrKey address.',
      );
    }

    if (!config.lyricsflipNftContractId) {
      newWarnings.push(
        'NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID is not set - NFT minting will fail until it is configured.',
      );
    } else if (!StrKey.isValidContract(config.lyricsflipNftContractId)) {
      newWarnings.push(
        'NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID is invalid - contract ID must be a valid C... StrKey address.',
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
            // Not re-running `authenticate()` here: re-signing on every reload
            // would need a user gesture most wallets won't grant silently.
            // Instead the HttpOnly refresh cookie restores the session
            // (LF-202); without one, the user calls `connect()` again.
            restoreSession()
              .then(setIsAuthenticated)
              .finally(() => setIsSessionChecked(true));
          } else {
            setIsSessionChecked(true);
          }
        })
        .catch(() => {
          // No wallet connected yet; expected on first load.
          setIsSessionChecked(true);
        });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to initialize Stellar wallet kit'));
    } finally {
      setIsLoading(false);
    }
  }, [rebuildSystemCalls]);

  // Wallets Kit has no account-change event, so poll `getAddress` on an
  // interval and whenever the window regains focus (the user usually
  // switches accounts in the extension, then clicks back into the tab).
  useEffect(() => {
    let cancelled = false;

    const checkAddress = async () => {
      try {
        const { address } = await StellarWalletsKit.getAddress();
        if (!cancelled) handleAddressChange(address || null);
      } catch {
        // `getAddress` throws when no wallet is connected/authorized; treat
        // that as a disconnection only if we previously had an account.
        if (!cancelled && accountRef.current) handleAddressChange(null);
      }
    };

    const onFocus = () => {
      void checkAddress();
    };

    window.addEventListener('focus', onFocus);
    const intervalId = window.setInterval(() => {
      void checkAddress();
    }, ADDRESS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(intervalId);
    };
  }, [handleAddressChange]);

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
    isSessionChecked,
  };

  // Show a clear "App is not configured" screen when either contract ID is
  // missing or invalid — the app is completely non-functional without them.
  const criticalWarnings = warnings.filter(
    (w) =>
      w.includes('NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID') ||
      w.includes('NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID'),
  );
  if (!isLoading && criticalWarnings.length > 0) {
    return <ConfigErrorScreen issues={criticalWarnings} />;
  }

  return <StellarContext.Provider value={contextValue}>{children}</StellarContext.Provider>;
};

export { StellarContext };
