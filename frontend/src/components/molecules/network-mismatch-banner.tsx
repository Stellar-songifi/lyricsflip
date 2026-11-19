'use client';

import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { AlertTriangle } from 'lucide-react';

/**
 * Renders a dismissible warning strip when the connected wallet is on a
 * different network than the one configured for this app. Reuses the same
 * visual style as other inline alerts in the design system.
 */
export function NetworkMismatchBanner() {
  const { networkMismatch, account } = useStellar();

  if (!account || !networkMismatch) return null;

  return (
    <div
      role="alert"
      className="w-full bg-yellow-50 border-b border-yellow-300 text-yellow-800 px-4 py-2 flex items-center gap-2 text-sm"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Your wallet is connected to a different network than this app expects.
        Switch to the correct network in your wallet to avoid failed transactions.
      </span>
    </div>
  );
}
