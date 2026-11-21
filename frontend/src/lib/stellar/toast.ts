import { toast } from 'sonner';
import type { contract } from '@stellar/stellar-sdk';
import {
  type ContractErrorInfo,
  LYRICSFLIP_ERRORS,
  parseContractError,
} from './errors';
import { reportError } from '@/lib/error-reporting';

const PUBLIC_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

const HORIZON_URL =
  process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';

/** Minimum balance in stroops required to pay transaction fees (0.1 XLM). */
const MIN_FEE_STROOPS = BigInt(1_000_000);

const explorerTxUrl = (hash: string, networkPassphrase: string) =>
  `https://stellar.expert/explorer/${networkPassphrase === PUBLIC_PASSPHRASE ? 'public' : 'testnet'}/tx/${hash}`;

interface HorizonBalance {
  asset_type: string;
  balance: string;
}

const toStroops = (balance: string): bigint => {
  const [whole, fraction = ''] = balance.split('.');
  return BigInt(whole + fraction.padEnd(7, '0').slice(0, 7));
};

/**
 * Fetches the account's native XLM balance and throws a friendly error if:
 * - the account doesn't exist on-chain (Horizon 404), or
 * - the balance is below `MIN_FEE_STROOPS`.
 *
 * Called before building/signing a transaction to catch funding issues early.
 */
async function assertSufficientBalance(
  address: string,
  required: bigint = MIN_FEE_STROOPS,
): Promise<void> {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
    if (res.status === 404) {
      throw new Error(
        'account not found: This account has no XLM and does not exist on-chain yet. Fund it with Friendbot (testnet) or send XLM to it first.',
      );
    }
    if (!res.ok) return; // Horizon unavailable — let the simulation catch it
    const { balances } = (await res.json()) as { balances: HorizonBalance[] };
    const native = balances.find((b) => b.asset_type === 'native');
    const balance = native ? toStroops(native.balance) : BigInt(0);
    if (balance < required) {
      const formatted = `${(Number(balance) / 1e7).toFixed(7).replace(/\.?0+$/, '')}`;
      throw new Error(
        `txInsufficientBalance: Your XLM balance (${formatted} XLM) is too low to pay transaction fees.`,
      );
    }
  } catch (err) {
    // Only re-throw errors we deliberately created above.
    // Network errors (fetch failures) are silently ignored so the transaction
    // attempt can still proceed through the RPC.
    if (
      err instanceof Error &&
      (err.message.startsWith('account not found') ||
        err.message.startsWith('txInsufficientBalance'))
    ) {
      throw err;
    }
  }
}

/**
 * Builds, signs and submits a mutating contract call, reporting progress as a
 * single toast: "Waiting for signature…" → "Submitting…" → "Confirmed" (with a
 * stellar.expert link) or "Failed: <friendly message>".
 *
 * When `publicKey` is provided a balance pre-check runs before the wallet
 * prompt to catch unfunded / low-balance accounts early and show a friendly
 * error instead of an opaque simulation failure.
 */
export interface TxResult<T> {
  result: T;
  /**
   * Ledger close time (unix seconds) of the ledger the transaction landed in,
   * i.e. the instant the network executed the call. `null` when the RPC
   * response did not include it.
   */
  closedAtSeconds: number | null;
  txHash?: string;
}

/**
 * Same as {@link withTxToast}, but also reports when the transaction was
 * included in a ledger. The contract's card/answer windows are measured in
 * ledger time, so callers that need to agree with it (e.g. the 15 s answer
 * window) must anchor on `closedAtSeconds` rather than the local clock.
 */
export async function withTxToastResult<T>(
  build: () => Promise<contract.AssembledTransaction<T>>,
  networkPassphrase: string,
  errors: Record<number, ContractErrorInfo> = LYRICSFLIP_ERRORS,
  publicKey?: string | null,
): Promise<TxResult<T>> {
  // Balance pre-check: surface friendly errors before asking for a signature.
  if (publicKey) {
    await assertSufficientBalance(publicKey);
  }

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
    // `createdAt` only exists on the success variant of the response union.
    const txResponse = sent.getTransactionResponse;
    const closedAtSeconds =
      txResponse && 'createdAt' in txResponse ? txResponse.createdAt : null;
    return {
      result: sent.result,
      closedAtSeconds,
      txHash: hash,
    };
  } catch (err) {
    const contractError = parseContractError(err, errors);
    toast.error(`Failed: ${contractError.message}`, { id });
    reportError(err, {
      contractError:
        contractError.code !== undefined
          ? errors[contractError.code]?.name
          : undefined,
      network:
        networkPassphrase === PUBLIC_PASSPHRASE ? 'public' : 'testnet',
      route:
        typeof window !== 'undefined' ? window.location.pathname : undefined,
    });
    throw err;
  }
}

export async function withTxToast<T>(
  build: () => Promise<contract.AssembledTransaction<T>>,
  networkPassphrase: string,
  errors: Record<number, ContractErrorInfo> = LYRICSFLIP_ERRORS,
  publicKey?: string | null,
): Promise<T> {
  const { result } = await withTxToastResult(
    build,
    networkPassphrase,
    errors,
    publicKey,
  );
  return result;
}
