'use client';

import { useOwnedNfts, type NftMetadata } from '@/hooks/useOwnedNfts';

interface NftBadgeGalleryProps {
  address: string | null | undefined;
}

/**
 * A responsive grid of NFT badges owned by `address`.
 * Each badge shows its image (or a placeholder) and its token ID / name.
 *
 * Part of Issue #476 / LF-059.
 */
export function NftBadgeGallery({ address }: NftBadgeGalleryProps) {
  const { nfts, isLoading, error, refresh } = useOwnedNfts(address);

  if (!address) {
    return (
      <section aria-label="NFT badge gallery">
        <p className="text-gray-500 text-sm">Connect your wallet to see your badges.</p>
      </section>
    );
  }

  return (
    <section aria-label="NFT badge gallery" className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">My Badges</h2>
        <button
          onClick={refresh}
          className="text-sm text-purple-600 hover:underline focus-visible:ring-2 focus-visible:ring-purple-500 rounded"
          aria-label="Refresh badge gallery"
          disabled={isLoading}
        >
          {isLoading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Loading state */}
      {isLoading && nfts.length === 0 && (
        <div
          role="status"
          aria-label="Loading badges"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4"
        >
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="animate-pulse bg-gray-100 rounded-2xl h-36"
              aria-hidden="true"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <p role="alert" className="text-red-600 text-sm">
          {error}
        </p>
      )}

      {/* Empty state */}
      {!isLoading && !error && nfts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <img
            src="/newbadge.png"
            alt=""
            className="w-20 h-20 opacity-30 mb-4"
            aria-hidden="true"
          />
          <p className="text-gray-500 text-sm">No badges yet. Win rounds to earn them!</p>
        </div>
      )}

      {/* Badge grid */}
      {nfts.length > 0 && (
        <ul
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 list-none p-0"
          aria-label={`${nfts.length} badge${nfts.length === 1 ? '' : 's'}`}
        >
          {nfts.map((nft) => (
            <BadgeCard key={nft.tokenId.toString()} nft={nft} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Individual badge card ──────────────────────────────────────────────────

function BadgeCard({ nft }: { nft: NftMetadata }) {
  const label = nft.name ?? `Badge #${nft.tokenId.toString()}`;

  return (
    <li className="flex flex-col items-center p-4 bg-white border border-purple-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
      {/* Badge image */}
      {nft.image ? (
        <img
          src={nft.image}
          alt={label}
          className="w-16 h-16 object-contain mb-3 rounded-full"
        />
      ) : (
        <img
          src="/newbadge.png"
          alt={label}
          className="w-16 h-16 object-contain mb-3 rounded-full"
        />
      )}

      {/* Badge name / ID */}
      <p className="text-xs font-semibold text-gray-800 text-center leading-tight truncate w-full text-center">
        {label}
      </p>
      <p className="text-xs text-gray-400 mt-1">#{nft.tokenId.toString()}</p>
    </li>
  );
}
