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
import { queryClient } from '@/lib/react-query';

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
  networkMismatch: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const StellarContext = createContext<StellarContextType>({
  setup: null,
  account: null,
  isLoading: true,
  error: null,
  warnings: [],
  networkMismatch: false,
  connect: async () => {},
  disconnect: async () => {},
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
  const [networkMismatch, setNetworkMismatch] = useState(false);
  const hasInit = useRef(false);
  // Track the last known address and network to detect changes on focus.
  const lastAddressRef = useRef<string | null>(null);
  const lastNetworkRef = useRef<string | null>(null);

  const rebuildSystemCalls = useCallback((address: string | null) => {
    setSystemCalls(createSystemCalls(configRef.current, address));
  }, []);

  /**
   * Clears all caches that are keyed on the connected account so the next
   * action uses fresh state for the new account / network.
   */
  const clearSessionCaches = useCallback(() => {
    queryClient.clear();
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const { address } = await StellarWalletsKit.authModal();
      lastAddressRef.current = address;
      setAccount({ address });
      rebuildSystemCalls(address);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to connect wallet'));
    }
  }, [rebuildSystemCalls]);

  const disconnect = useCallback(async () => {
    try {
      await StellarWalletsKit.disconnect();
    } finally {
      lastAddressRef.current = null;
      lastNetworkRef.current = null;
      setAccount(null);
      setNetworkMismatch(false);
      clearSessionCaches();
      rebuildSystemCalls(null);
    }
  }, [rebuildSystemCalls, clearSessionCaches]);

  /**
   * Polls the wallet for the current address and network. Called on window
   * focus so we catch account / network switches that happen while the tab is
   * in the background, without requiring the wallet kit to expose a change
   * event API.
   */
  const syncWalletState = useCallback(async () => {
    if (!hasInit.current) return;
    try {
      const [{ address }, { network }] = await Promise.all([
        StellarWalletsKit.getAddress(),
        StellarWalletsKit.getNetwork(),
      ]);

      const expectedPassphrase = configRef.current.networkPassphrase;
      const mismatch = !!network && network !== expectedPassphrase;
      setNetworkMismatch(mismatch);

      const prevAddress = lastAddressRef.current;
      const prevNetwork = lastNetworkRef.current;

      const addressChanged = prevAddress !== null && address !== prevAddress;
      const networkChanged = prevNetwork !== null && network !== prevNetwork;

      if (addressChanged || networkChanged) {
        // Something changed: flush all caches and rebuild system calls for the
        // new address (or null if the wallet was disconnected).
        clearSessionCaches();
        lastAddressRef.current = address || null;
        lastNetworkRef.current = network || null;
        if (address) {
          setAccount({ address });
          rebuildSystemCalls(address);
        } else {
          setAccount(null);
          rebuildSystemCalls(null);
        }
      }
    } catch {
      // Wallet not connected or not responding – nothing to do.
    }
  }, [rebuildSystemCalls, clearSessionCaches]);

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
            lastAddressRef.current = address;
            setAccount({ address });
            rebuildSystemCalls(address);
          }
        })
        .catch(() => {
          // No wallet connected yet; expected on first load.
        });

      StellarWalletsKit.getNetwork()
        .then(({ network }) => {
          if (network) {
            lastNetworkRef.current = network;
            const mismatch = network !== config.networkPassphrase;
            setNetworkMismatch(mismatch);
          }
        })
        .catch(() => {
          // Network info unavailable; non-fatal.
        });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to initialize Stellar wallet kit'));
    } finally {
      setIsLoading(false);
    }
  }, [rebuildSystemCalls]);

  // Poll wallet state on window focus to detect account / network switches.
  useEffect(() => {
    const handleFocus = () => {
      syncWalletState();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [syncWalletState]);

  const contextValue: StellarContextType = {
    setup: systemCalls ? { systemCalls, account } : null,
    account,
    isLoading,
    error,
    warnings,
    networkMismatch,
    connect,
    disconnect,
  };

  return <StellarContext.Provider value={contextValue}>{children}</StellarContext.Provider>;
};

export { StellarContext };
