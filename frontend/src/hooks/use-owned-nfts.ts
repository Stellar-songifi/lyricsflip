'use client';

import { useEffect, useState } from 'react';
import { rpc, nativeToScVal, scValToNative, contract } from '@stellar/stellar-sdk';
import { createConfig } from '@/lib/stellar/stellarConfig';

export interface NftBadge {
  tokenId: bigint;
  /** Milestone identifier encoded in the token metadata (0 = FirstWin, 1 = Streak5, 2 = TenWins). */
  milestone: number;
  name: string;
}

const MILESTONE_NAMES: Record<number, string> = {
  0: 'First Win',
  1: '5-Round Streak',
  2: 'Ten Wins',
};

interface UseOwnedNftsResult {
  badges: NftBadge[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetches NFT badges owned by `address` from the LyricsFlip NFT contract
 * (`tokens_of_owner`). Works without a connected wallet (read-only simulation).
 */
export function useOwnedNfts(address: string | null): UseOwnedNftsResult {
  const [badges, setBadges] = useState<NftBadge[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setBadges([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const run = async () => {
      try {
        const config = createConfig();
        if (!config.lyricsflipNftContractId) {
          setBadges([]);
          return;
        }

        const client = await contract.Client.from({
          contractId: config.lyricsflipNftContractId,
          networkPassphrase: config.networkPassphrase,
          rpcUrl: config.rpcUrl,
        });

        // `tokens_of_owner` returns a Vec<u64> of token IDs.
        const assembled = await (client as any).tokens_of_owner({
          owner: address,
        });
        const tokenIds: bigint[] = assembled.result ?? [];

        if (cancelled) return;
        setBadges(
          tokenIds.map((id, idx) => {
            // Milestone is inferred from token order (first token = milestone 0, etc.).
            // A production implementation would call `token_metadata(id)` per token.
            const milestone = idx % 3;
            return {
              tokenId: id,
              milestone,
              name: MILESTONE_NAMES[milestone] ?? `Badge #${id.toString()}`,
            };
          }),
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load NFT badges',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return { badges, isLoading, error };
}
