import { toast } from 'sonner';
import type { contract } from '@stellar/stellar-sdk';
import type { QueryClient } from '@tanstack/react-query';
import {
  type ContractErrorInfo,
  LYRICSFLIP_ERRORS,
  parseContractError,
} from './errors';

const PUBLIC_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

const explorerTxUrl = (hash: string, networkPassphrase: string) =>
  `https://stellar.expert/explorer/${networkPassphrase === PUBLIC_PASSPHRASE ? 'public' : 'testnet'}/tx/${hash}`;

export interface WithTxToastOptions {
  /**
   * Query keys to invalidate after the transaction is confirmed.  Pass the
   * round-related keys from `QUERY_KEYS` (see `use-chain-queries.ts`) so
   * every subscriber refreshes once instead of waiting for the next polling
   * tick.
   */
  invalidateKeys?: unknown[][];
  queryClient?: QueryClient;
}

/**
 * Builds, signs and submits a mutating contract call, reporting progress as a
 * single toast: "Waiting for signature…" → "Submitting…" → "Confirmed" (with a
 * stellar.expert link) or "Failed: <friendly message>".
 *
 * After a successful submission, all `invalidateKeys` are invalidated on the
 * provided `queryClient` so related queries re-fetch immediately.
 */
export async function withTxToast<T>(
  build: () => Promise<contract.AssembledTransaction<T>>,
  networkPassphrase: string,
  errors: Record<number, ContractErrorInfo> = LYRICSFLIP_ERRORS,
  options: WithTxToastOptions = {},
): Promise<T> {
  const { invalidateKeys, queryClient } = options;
  const id = toast.loading('Waiting for signature…');
  try {
    const assembled = await build();
    await assembled.sign();
    toast.loading('Submitting…', { id });
    const sent = await assembled.send();
    const hash = sent.sendTransactionResponse?.hash;
    toast.success('Confirmed', {
      id,
      action: hash
        ? {
            label: 'View',
            onClick: () =>
              window.open(explorerTxUrl(hash, networkPassphrase), '_blank'),
          }
        : undefined,
    });

    // Invalidate any provided React Query keys so subscribers pick up the
    // new chain state immediately without waiting for the next poll tick.
    if (queryClient && invalidateKeys?.length) {
      await Promise.all(
        invalidateKeys.map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      );
    }

    return sent.result;
  } catch (err) {
    toast.error(`Failed: ${parseContractError(err, errors).message}`, { id });
    throw err;
  }
}
