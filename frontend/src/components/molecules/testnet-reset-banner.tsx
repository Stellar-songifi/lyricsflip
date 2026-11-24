'use client';

import { useContractAvailability } from '@/lib/stellar/hooks/use-contract-availability';

/**
 * LF-365: explain the otherwise cryptic "contract not found" that follows a
 * Stellar testnet reset. Mounted below the navbar so it is visible on every
 * route of a preview that still points at wiped contract IDs.
 */
export function TestnetResetBanner() {
  const { isTestnetReset, isLoading } = useContractAvailability();

  if (isLoading || !isTestnetReset) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="bg-red-100 dark:bg-red-950 text-red-900 dark:text-red-100 px-4 py-3 text-center text-sm"
    >
      <p className="font-semibold">Stellar testnet was reset.</p>
      <p>
        The contracts recorded for this preview no longer exist on testnet, which is why the game
        reports &ldquo;contract not found&rdquo;. The deployment workflow is redeploying and
        reseeding them automatically. This preview will work again once it is rebuilt with the new
        contract IDs.
      </p>
    </div>
  );
}
