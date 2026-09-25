'use client';

import { useEffect, useState } from 'react';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { createConfig } from '@/lib/stellar/stellarConfig';

const expectedPassphrase = createConfig().networkPassphrase;

/**
 * Warns when the connected wallet is on a different network than the app
 * (`NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE`), and surfaces config warnings
 * (e.g. missing contract IDs) in development only.
 */
export function WalletStatusBanner({ className }: { className?: string }) {
  const { account, warnings } = useStellar();
  const [walletPassphrase, setWalletPassphrase] = useState<string | null>(null);

  useEffect(() => {
    if (!account?.address) {
      setWalletPassphrase(null);
      return;
    }
    let cancelled = false;
    // Imported lazily: the kit touches `window` and must stay client-only.
    import('@creit.tech/stellar-wallets-kit')
      .then(({ StellarWalletsKit }) => StellarWalletsKit.getNetwork())
      .then(({ networkPassphrase }) => {
        if (!cancelled) setWalletPassphrase(networkPassphrase);
      })
      .catch(() => {
        // Some wallets can't report their network; don't show a false alarm.
        if (!cancelled) setWalletPassphrase(null);
      });
    return () => {
      cancelled = true;
    };
  }, [account?.address]);

  const messages: string[] = [];
  if (walletPassphrase && walletPassphrase !== expectedPassphrase) {
    messages.push(
      `Your wallet is on a different network. Switch it to "${expectedPassphrase}" to play.`,
    );
  }
  if (process.env.NODE_ENV === 'development') messages.push(...warnings);

  if (messages.length === 0) return null;

  return (
    <div
      role="alert"
      className={`bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100 text-xs px-4 py-2 text-center ${className ?? ''}`}
    >
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  );
}
