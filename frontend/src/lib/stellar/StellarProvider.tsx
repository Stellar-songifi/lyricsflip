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
import { ConfigErrorScreen } from '@/components/organisms/ConfigErrorScreen';

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
}

const StellarContext = createContext<StellarContextType>({
  setup: null,
  account: null,
  isLoading: true,
  error: null,
  warnings: [],
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
  const hasInit = useRef(false);

  const rebuildSystemCalls = useCallback((address: string | null) => {
    setSystemCalls(createSystemCalls(configRef.current, address));
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const { address } = await StellarWalletsKit.authModal();
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
      setAccount(null);
      rebuildSystemCalls(null);
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
  };

  // Show a clear "App is not configured" screen when the game contract ID is
  // missing — the app is completely non-functional without it.
  const criticalWarnings = warnings.filter((w) =>
    w.includes('NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID'),
  );
  if (!isLoading && criticalWarnings.length > 0) {
    return <ConfigErrorScreen issues={criticalWarnings} />;
  }

  return <StellarContext.Provider value={contextValue}>{children}</StellarContext.Provider>;
};

export { StellarContext };
