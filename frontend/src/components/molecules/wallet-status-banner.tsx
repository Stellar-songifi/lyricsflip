'use client';

import { useEffect, useState } from 'react';
import { useStellar } from '@/lib/stellar/hooks/use-stellar';
import { useXlmBalance } from '@/lib/stellar/hooks/use-xlm-balance';
import { createConfig } from '@/lib/stellar/stellar-config';
import { Button } from '@/components/atoms/button';

const expectedPassphrase = createConfig().networkPassphrase;

/**
 * Persistent status banner that covers several wallet health scenarios:
 *
 * 1. Network mismatch — warns when the connected wallet is on a different
 *    network than the app (`NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE`).
 * 2. Unfunded account — detects a brand-new testnet wallet (Horizon 404)
 *    and offers a one-click "Fund with Friendbot" button so the user can
 *    start playing without leaving the app.
 * 3. Low balance — warns when the balance is below the minimum needed to
 *    pay transaction fees, and again offers Friendbot on testnet.
 * 4. Config warnings — surfaces missing contract ID warnings in development.
 */
export function WalletStatusBanner({ className }: { className?: string }) {
  const { account, warnings } = useStellar();
  const {
    isUnfunded,
    isBelowMinFee,
    formatted,
    isTestnet,
    fundWithFriendbot,
    isFunding,
    fundingError,
    isLoading: isBalanceLoading,
  } = useXlmBalance();

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

  const networkMismatch =
    !!walletPassphrase && walletPassphrase !== expectedPassphrase;

  // Determine which scenario to show (in priority order)
  const showUnfunded = !!account?.address && !isBalanceLoading && isUnfunded;
  const showLowBalance =
    !!account?.address && !isBalanceLoading && !isUnfunded && isBelowMinFee;
  const showNetworkMismatch = networkMismatch;

  const devWarnings =
    process.env.NODE_ENV === 'development' ? warnings : [];

  const hasAnything =
    showUnfunded || showLowBalance || showNetworkMismatch || devWarnings.length > 0;

  if (!hasAnything) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`text-xs px-4 py-2 text-center space-y-1 ${className ?? ''} ${
        showUnfunded || showLowBalance
          ? 'bg-orange-100 dark:bg-orange-900 text-orange-900 dark:text-orange-100'
          : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100'
      }`}
    >
      {showNetworkMismatch && (
        <p>
          Your wallet is on a different network. Switch it to &ldquo;{expectedPassphrase}&rdquo; to
          play.
        </p>
      )}

      {showUnfunded && (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <p>
            This wallet has no XLM and doesn&apos;t exist on-chain yet.
            {isTestnet
              ? ' Fund it with Friendbot to start playing.'
              : ' You need XLM to pay transaction fees.'}
          </p>
          {isTestnet && (
            <Button
              variant="purple"
              size="sm"
              onClick={fundWithFriendbot}
              disabled={isFunding}
              aria-busy={isFunding}
              className="shrink-0"
            >
              {isFunding ? 'Funding…' : 'Fund with Friendbot'}
            </Button>
          )}
        </div>
      )}

      {showLowBalance && (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <p>
            Your XLM balance ({formatted} XLM) is too low to pay transaction fees.
            {isTestnet ? ' Use Friendbot to top up.' : ' Add XLM to continue.'}
          </p>
          {isTestnet && (
            <Button
              variant="purple"
              size="sm"
              onClick={fundWithFriendbot}
              disabled={isFunding}
              aria-busy={isFunding}
              className="shrink-0"
            >
              {isFunding ? 'Funding…' : 'Fund with Friendbot'}
            </Button>
          )}
        </div>
      )}

      {fundingError && (
        <p className="text-red-700 dark:text-red-300">Friendbot error: {fundingError}</p>
      )}

      {devWarnings.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  );
}
