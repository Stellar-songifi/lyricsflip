'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Share, ArrowLeft, Copy } from 'lucide-react';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import type { PlayerStats } from '@/lib/stellar/types';
import { NftBadgeGallery } from '@/components/organisms/nft-badge-gallery';
import { Button } from '@/components/atoms/button';

interface ProfileViewProps {
  /** When provided (routed from /profile/[address]) renders that address.
   *  When omitted the page falls back to the connected wallet's address. */
  address?: string;
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1 shadow-sm">
      <span className="text-xs text-gray-500 uppercase tracking-wide">
        {label}
      </span>
      <span className="text-2xl font-bold text-gray-900">{value}</span>
    </div>
  );
}

export default function ProfileView({ address: propAddress }: ProfileViewProps = {}) {
  const router = useRouter();
  const { systemCalls, account } = useStellar();

  // Resolve which address to display.
  const address = propAddress ?? account?.address ?? null;

  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  const profileUrl =
    typeof window !== 'undefined' && address
      ? `${window.location.origin}/profile/${address}`
      : '';

  useEffect(() => {
    if (!address || !systemCalls) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    systemCalls
      .getPlayerStat(address)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load player stats',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, systemCalls]);

  const handleShare = () => {
    if (!profileUrl) return;
    if (navigator.share) {
      navigator
        .share({
          title: `${shortAddress}'s LyricsFlip Profile`,
          url: profileUrl,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(profileUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  // No address and no wallet connected.
  if (!address) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Profile</h1>
        <p className="text-gray-600 mb-6">
          Connect your wallet to view your profile.
        </p>
        <Button onClick={() => router.push('/')}>Go Home</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Back navigation */}
      <button
        onClick={() => router.back()}
        className="flex items-center text-gray-600 mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold break-all">{shortAddress}</h1>
          <p className="text-sm text-gray-500 mt-1 break-all">{address}</p>
        </div>
        <button
          onClick={handleShare}
          title={copied ? 'Copied!' : 'Share profile'}
          className="ml-4 flex items-center gap-1 text-purple-600 hover:text-purple-800 text-sm font-medium shrink-0"
        >
          {copied ? <Copy className="h-4 w-4" /> : <Share className="h-4 w-4" />}
          {copied ? 'Copied' : 'Share'}
        </button>
      </div>

      {/* Stats section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">On-chain Stats</h2>
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border bg-gray-100 h-20 animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Rounds Played"
              value={stats.total_rounds.toString()}
            />
            <StatCard
              label="Rounds Won"
              value={stats.rounds_won.toString()}
            />
            <StatCard
              label="Current Streak"
              value={stats.current_streak.toString()}
            />
            <StatCard
              label="Best Streak"
              value={stats.max_streak.toString()}
            />
          </div>
        ) : (
          <p className="text-sm text-gray-500">No stats found for this address.</p>
        )}
      </section>

      {/* Badge gallery */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">NFT Badges</h2>
        <NftBadgeGallery address={address} />
      </section>

      {/* Round history placeholder */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Round History</h2>
        <p className="text-sm text-gray-500">
          Full round history will be available once the indexer endpoint is
          wired up (LF-286).
        </p>
      </section>
    </div>
  );
}
