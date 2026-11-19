'use client';

import { useOwnedNfts, type NftBadge } from '@/hooks/use-owned-nfts';
import { Trophy } from 'lucide-react';

interface NftBadgeGalleryProps {
  address: string;
}

function BadgeTile({ badge }: { badge: NftBadge }) {
  const colours = [
    'bg-yellow-100 text-yellow-800 border-yellow-300',
    'bg-purple-100 text-purple-800 border-purple-300',
    'bg-blue-100 text-blue-800 border-blue-300',
  ];
  const colour = colours[badge.milestone % colours.length];

  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-4 ${colour}`}
      title={`Token #${badge.tokenId.toString()}`}
    >
      <Trophy className="h-8 w-8" aria-hidden="true" />
      <span className="text-xs font-semibold text-center leading-tight">
        {badge.name}
      </span>
    </div>
  );
}

/**
 * Displays all NFT badges owned by `address`.
 * Handles loading, empty, and error states.
 */
export function NftBadgeGallery({ address }: NftBadgeGalleryProps) {
  const { badges, isLoading, error } = useOwnedNfts(address);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border bg-gray-100 h-24 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-500">Could not load badges: {error}</p>
    );
  }

  if (badges.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No badges yet — win rounds to earn NFT badges.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {badges.map((badge) => (
        <BadgeTile key={badge.tokenId.toString()} badge={badge} />
      ))}
    </div>
  );
}
