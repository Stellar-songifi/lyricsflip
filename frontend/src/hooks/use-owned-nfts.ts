'use client';

/**
 * useOwnedNfts
 *
 * Returns the NFT badges owned by `address` on the LyricsFlip NFT contract,
 * each with its milestone kind and display name.
 *
 * Loading makes exactly two RPC calls however many tokens exist in total
 * (LF-203):
 * 1. `simulateTransaction` of `tokens_of_owner(owner, 0, MAX_TOKENS_PER_PAGE)`
 *    (LF-170) to list the owner's token ids.
 * 2. One batched `getLedgerEntries` that reads every `TokenKind(id)` entry
 *    (LF-168) at once, instead of one `token_kind` call per token.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { createConfig } from '../lib/stellar/stellar-config';
import { MILESTONE_NAMES, type Milestone } from '../lib/stellar/types';

/** Mirrors `MAX_TOKENS_PER_PAGE` in the NFT contract. */
const MAX_TOKENS_PER_PAGE = 50;

export interface NftMetadata {
  tokenId: bigint;
  /** Milestone the badge represents (`token_kind`). */
  kind: number;
  /** Display name for the milestone, when the kind is known. */
  name?: string;
  /** Optional badge image URL. */
  image?: string;
}

export interface UseOwnedNftsResult {
  nfts: NftMetadata[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Ledger key of the NFT contract's `DataKey::TokenKind(token_id)` entry. */
function tokenKindKey(contractId: string, tokenId: bigint): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key: xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('TokenKind'),
        nativeToScVal(tokenId, { type: 'u128' }),
      ]),
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
}

export async function fetchOwnedNfts(owner: string): Promise<NftMetadata[]> {
  const { lyricsflipNftContractId, rpcUrl, networkPassphrase } = createConfig();
  if (!lyricsflipNftContractId) {
    throw new Error('NFT contract ID is not configured');
  }
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });

  // RPC call 1: list the owner's token ids. A read-only simulation needs no
  // funded source account, so the owner's address with sequence 0 is enough.
  const tx = new TransactionBuilder(new Account(owner, '0'), {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      new Contract(lyricsflipNftContractId).call(
        'tokens_of_owner',
        nativeToScVal(owner, { type: 'address' }),
        nativeToScVal(0, { type: 'u32' }),
        nativeToScVal(MAX_TOKENS_PER_PAGE, { type: 'u32' }),
      ),
    )
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  const tokenIds = (sim.result ? scValToNative(sim.result.retval) : []) as bigint[];
  if (tokenIds.length === 0) {
    return [];
  }

  // RPC call 2: read every token's kind in one batched request.
  const keys = tokenIds.map((id) => tokenKindKey(lyricsflipNftContractId, id));
  const { entries } = await server.getLedgerEntries(...keys);
  const kindByKey = new Map<string, number>();
  for (const entry of entries) {
    if (entry.val.type !== 'contractData') continue;
    kindByKey.set(
      entry.key.toXDR('base64'),
      Number(scValToNative(entry.val.contractData.val)),
    );
  }

  return tokenIds
    .map((tokenId, i) => {
      // `token_kind` defaults to 0 when no kind was stored.
      const kind = kindByKey.get(keys[i].toXDR('base64')) ?? 0;
      return { tokenId, kind, name: MILESTONE_NAMES[kind as Milestone] };
    })
    .sort((a, b) => (a.tokenId < b.tokenId ? -1 : a.tokenId > b.tokenId ? 1 : 0));
}

export function useOwnedNfts(address: string | null | undefined): UseOwnedNftsResult {
  const [nfts, setNfts] = useState<NftMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) {
      setNfts([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setNfts(await fetchOwnedNfts(address));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch owned NFTs');
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  return { nfts, isLoading, error, refresh: load };
}
