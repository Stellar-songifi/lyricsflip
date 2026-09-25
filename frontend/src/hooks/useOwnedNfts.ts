'use client';

/**
 * useOwnedNfts
 *
 * Returns the list of NFT token IDs (and, once resolved, their metadata URIs)
 * owned by `address` on the LyricsFlip NFT contract.
 *
 * Strategy
 * --------
 * The on-chain NFT contract does not expose a "tokens of owner" enumeration,
 * so we reconstruct ownership by iterating token IDs from 0 to `token_count`
 * and comparing each owner to the requested address.  On testnet the token
 * count is expected to stay small (< 100), so a sequential scan is fine;
 * a production indexer can replace this later (LF-019).
 *
 * We also use `claim_reward` and `owner_of` from `SystemCalls` (via
 * `StellarConfig`) to resolve the base URI and build full metadata URLs.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { contract } from '@stellar/stellar-sdk';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import { createConfig } from '../lib/stellar/stellarConfig';

// ── Types ──────────────────────────────────────────────────────────────────

export interface NftMetadata {
  tokenId: bigint;
  /** Full URL to the token's JSON metadata, e.g. `<baseUri>/<tokenId>`. */
  metadataUri: string;
  /** Optional: badge image loaded from `metadataUri` (name field). */
  name?: string;
  /** Optional: badge image URL loaded from `metadataUri` (image field). */
  image?: string;
}

export interface UseOwnedNftsResult {
  nfts: NftMetadata[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

// ── Minimal NFT contract client ────────────────────────────────────────────

type NftContract = {
  token_count: () => Promise<contract.AssembledTransaction<bigint>>;
  owner_of: (args: { token_id: bigint }) => Promise<contract.AssembledTransaction<string>>;
  base_uri: () => Promise<contract.AssembledTransaction<string>>;
};

function makeSignTransaction(networkPassphrase: string) {
  return async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) => {
    const { signedTxXdr, signerAddress } = await StellarWalletsKit.signTransaction(xdr, {
      networkPassphrase: opts?.networkPassphrase ?? networkPassphrase,
      address: opts?.address,
    });
    return { signedTxXdr, signerAddress };
  };
}

async function getNftClient(
  contractId: string,
  rpcUrl: string,
  networkPassphrase: string,
  publicKey?: string,
) {
  return contract.Client.from<NftContract>({
    contractId,
    networkPassphrase,
    rpcUrl,
    publicKey,
    signTransaction: makeSignTransaction(networkPassphrase),
  });
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useOwnedNfts(address: string | null | undefined): UseOwnedNftsResult {
  const [nfts, setNfts] = useState<NftMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshCounter = useRef(0);

  const fetchOwnedNfts = useCallback(async () => {
    if (!address) {
      setNfts([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const config = createConfig();
      const { lyricsflipNftContractId, rpcUrl, networkPassphrase } = config;

      if (!lyricsflipNftContractId) {
        setError('NFT contract ID is not configured');
        return;
      }

      const client = await getNftClient(
        lyricsflipNftContractId,
        rpcUrl,
        networkPassphrase,
        address,
      );

      // 1. Get total minted token count
      const countAssembled = await client.token_count();
      const totalCount = Number(countAssembled.result);

      if (totalCount === 0) {
        setNfts([]);
        return;
      }

      // 2. Get base URI once
      const baseUriAssembled = await client.base_uri();
      const baseUri = baseUriAssembled.result.replace(/\/$/, ''); // strip trailing slash

      // 3. Scan all token IDs to find tokens owned by `address`
      const owned: NftMetadata[] = [];

      await Promise.all(
        Array.from({ length: totalCount }, (_, i) => BigInt(i)).map(async (tokenId) => {
          try {
            const ownerAssembled = await client.owner_of({ token_id: tokenId });
            if (ownerAssembled.result === address) {
              owned.push({
                tokenId,
                metadataUri: `${baseUri}/${tokenId.toString()}`,
              });
            }
          } catch {
            // Token may not exist yet; skip silently
          }
        }),
      );

      // Sort by token ID ascending
      owned.sort((a, b) => (a.tokenId < b.tokenId ? -1 : a.tokenId > b.tokenId ? 1 : 0));

      // 4. Optionally enrich metadata from the token URI (best effort)
      const enriched = await Promise.all(
        owned.map(async (nft) => {
          try {
            const res = await fetch(nft.metadataUri);
            if (res.ok) {
              const data = await res.json();
              return {
                ...nft,
                name: data.name as string | undefined,
                image: data.image as string | undefined,
              };
            }
          } catch {
            // Metadata fetch is best-effort; return the token without enrichment
          }
          return nft;
        }),
      );

      setNfts(enriched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch owned NFTs');
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchOwnedNfts();
  }, [fetchOwnedNfts, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchOwnedNfts();
  }, [fetchOwnedNfts]);

  return { nfts, isLoading, error, refresh };
}
