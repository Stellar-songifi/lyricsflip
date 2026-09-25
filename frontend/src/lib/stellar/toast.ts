import { toast } from 'sonner';
import type { contract } from '@stellar/stellar-sdk';
import {
  type ContractErrorInfo,
  LYRICSFLIP_ERRORS,
  parseContractError,
} from './errors';

const PUBLIC_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

const explorerTxUrl = (hash: string, networkPassphrase: string) =>
  `https://stellar.expert/explorer/${networkPassphrase === PUBLIC_PASSPHRASE ? 'public' : 'testnet'}/tx/${hash}`;

/**
 * Builds, signs and submits a mutating contract call, reporting progress as a
 * single toast: "Waiting for signature…" → "Submitting…" → "Confirmed" (with a
 * stellar.expert link) or "Failed: <friendly message>".
 */
export async function withTxToast<T>(
  build: () => Promise<contract.AssembledTransaction<T>>,
  networkPassphrase: string,
  errors: Record<number, ContractErrorInfo> = LYRICSFLIP_ERRORS,
): Promise<T> {
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
    return sent.result;
  } catch (err) {
    toast.error(`Failed: ${parseContractError(err, errors).message}`, { id });
    throw err;
  }
}
