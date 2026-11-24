/**
 * LF-314 · Transaction manager
 *
 * Wraps withTxToast with:
 *   1. Registration in the Zustand tx-store so every transaction is visible in
 *      the navbar tray.
 *   2. Automatic retry on TRY_AGAIN_LATER (congestion) with exponential jitter.
 *   3. Automatic rebuild-and-resign on txBadSeq (stale sequence number).
 *   4. Double-submit guard: a pending entry in the store for the same `label`
 *      prevents the same game action being submitted twice.
 */

import { toast } from 'sonner';
import type { contract } from '@stellar/stellar-sdk';
import type { QueryClient } from '@tanstack/react-query';
import {
  type ContractErrorInfo,
  LYRICSFLIP_ERRORS,
  parseContractError,
} from './errors';
import { useTxStore } from '@/store/tx-store';
import { createConfig } from './stellarConfig';

const PUBLIC_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

function explorerTxUrl(hash: string, networkPassphrase: string): string {
  const net =
    networkPassphrase === PUBLIC_PASSPHRASE ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${net}/tx/${hash}`;
}

/** True when the error looks like a Soroban TRY_AGAIN_LATER status. */
function isTryAgainLater(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return /TRY_AGAIN_LATER|try_again_later/i.test(text);
}

/** True when the error is a stale sequence number. */
function isBadSeq(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return /txBadSeq|bad_seq|sequence/i.test(text);
}

/**
 * Returns a jittered delay in milliseconds for retry attempt `n` (0-indexed).
 * Base is 2 s, doubles each time up to 30 s, with ±20 % jitter.
 */
function retryDelayMs(attempt: number): number {
  const base = Math.min(2_000 * 2 ** attempt, 30_000);
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

export interface ManagedTxOptions {
  /** Short label shown in the tray and toast ("Join round #42"). */
  label: string;
  /** Maximum number of automatic retries on transient errors. Default: 3. */
  maxRetries?: number;
  /** Query keys to invalidate after success. */
  invalidateKeys?: unknown[][];
  queryClient?: QueryClient;
  errors?: Record<number, ContractErrorInfo>;
}

/**
 * Builds, signs and submits a mutating Soroban transaction with:
 *  - Sonner toast feedback (pending → success / failed).
 *  - Entry in the Zustand tx-store (visible in the navbar tray).
 *  - Retry on TRY_AGAIN_LATER with exponential jitter.
 *  - Rebuild-and-resign on txBadSeq.
 *  - Double-submit guard by label.
 */
export async function withManagedTx<T>(
  build: () => Promise<contract.AssembledTransaction<T>>,
  networkPassphrase: string,
  options: ManagedTxOptions,
): Promise<T> {
  const {
    label,
    maxRetries = 3,
    invalidateKeys,
    queryClient,
    errors = LYRICSFLIP_ERRORS,
  } = options;

  const store = useTxStore.getState();

  // --- Double-submit guard ---
  const inFlight = store.transactions.find(
    (tx) =>
      tx.label === label &&
      (tx.status === 'pending' || tx.status === 'retrying'),
  );
  if (inFlight) {
    toast.warning(`"${label}" is already being submitted. Please wait.`);
    throw new Error(`Double-submit guard: "${label}" is already in flight.`);
  }

  const txId = store.addTx(label);
  const toastId = toast.loading(`${label} — waiting for signature…`);

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const assembled = await build();
      await assembled.sign();

      store.updateTx(txId, { status: 'pending' });
      toast.loading(`${label} — submitting…`, { id: toastId });

      const sent = await assembled.send();
      const hash = sent.sendTransactionResponse?.hash;

      // Update store with final hash and success status
      store.updateTx(txId, { status: 'success', hash });

      toast.success(`${label} — confirmed`, {
        id: toastId,
        action: hash
          ? {
              label: 'View',
              onClick: () =>
                window.open(explorerTxUrl(hash, networkPassphrase), '_blank'),
            }
          : undefined,
      });

      // Invalidate React Query caches
      if (queryClient && invalidateKeys?.length) {
        await Promise.all(
          invalidateKeys.map((key) =>
            queryClient.invalidateQueries({ queryKey: key }),
          ),
        );
      }

      return sent.result;
    } catch (err) {
      lastError = err;

      if (isBadSeq(err) && attempt < maxRetries) {
        // Stale sequence: we need a fresh assembled transaction (new nonce)
        // so we simply loop — `build()` will re-simulate on the next iteration.
        const delay = retryDelayMs(attempt);
        store.updateTx(txId, {
          status: 'retrying',
          attempts: attempt + 2,
          error: 'Stale sequence number — rebuilding transaction…',
        });
        toast.loading(
          `${label} — stale sequence, retrying in ${Math.round(delay / 1000)} s…`,
          { id: toastId },
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (isTryAgainLater(err) && attempt < maxRetries) {
        const delay = retryDelayMs(attempt);
        store.updateTx(txId, {
          status: 'retrying',
          attempts: attempt + 2,
          error: 'Network congestion — retrying…',
        });
        toast.loading(
          `${label} — network busy, retrying in ${Math.round(delay / 1000)} s…`,
          { id: toastId },
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Permanent failure
      const { message } = parseContractError(err, errors);
      store.updateTx(txId, { status: 'failed', error: message });
      toast.error(`${label} — failed: ${message}`, { id: toastId });
      throw err;
    }
  }

  // Exhausted retries
  const { message } = parseContractError(lastError, errors);
  store.updateTx(txId, { status: 'failed', error: message });
  toast.error(`${label} — failed after ${maxRetries} retries: ${message}`, {
    id: toastId,
  });
  throw lastError;
}
