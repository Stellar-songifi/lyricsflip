'use client';

import { NftBadgeGallery } from '@/components/organisms/NftBadgeGallery';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { useEffect, useState } from 'react';
import type { PlayerStats } from '@/lib/stellar/types';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/**
 * Profile page – shows on-chain player stats and the NFT badge gallery.
 *
 * Part of Issue #476 / LF-059.
 */
export default function ProfilePage() {
  const router = useRouter();
  const { account, systemCalls, connect } = useStellar();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Load player stats from the contract
  useEffect(() => {
    if (!account?.address || !systemCalls) return;

    setIsLoadingStats(true);
    setStatsError(null);

    systemCalls
      .getPlayerStat(account.address)
      .then(setStats)
      .catch((err: unknown) => {
        setStatsError(err instanceof Error ? err.message : 'Failed to load stats');
      })
      .finally(() => setIsLoadingStats(false));
  }, [account?.address, systemCalls]);

  return (
    <main
      className="container mx-auto px-4 py-8 mt-16 lg:mt-24 max-w-3xl"
      aria-label="Player profile"
    >
      {/* Back navigation */}
      <button
        onClick={() => router.push('/')}
        className="flex items-center text-gray-600 mb-6 focus-visible:ring-2 focus-visible:ring-purple-500 rounded"
        aria-label="Back to home"
      >
        <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
        Back
      </button>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile</h1>

      {/* Wallet address */}
      {account?.address ? (
        <p className="text-sm text-gray-500 mb-6 font-mono break-all" aria-label="Wallet address">
          {account.address}
        </p>
      ) : (
        <div className="mb-6">
          <p className="text-gray-600 text-sm mb-3">
            Connect your wallet to view your profile and badges.
          </p>
          <button
            onClick={connect}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 focus-visible:ring-2 focus-visible:ring-purple-700"
          >
            Connect Wallet
          </button>
        </div>
      )}

      {/* On-chain stats */}
      {account?.address && (
        <section aria-label="Player statistics" className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Stats</h2>

          {isLoadingStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-20" aria-hidden="true" />
              ))}
            </div>
          )}

          {statsError && (
            <p role="alert" className="text-red-600 text-sm">
              {statsError}
            </p>
          )}

          {stats && !isLoadingStats && (
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Total Rounds" value={stats.total_rounds.toString()} />
              <StatCard label="Rounds Won" value={stats.rounds_won.toString()} />
              <StatCard label="Current Streak" value={stats.current_streak.toString()} />
              <StatCard label="Best Streak" value={stats.max_streak.toString()} />
            </dl>
          )}
        </section>
      )}

      {/* NFT badge gallery */}
      <NftBadgeGallery address={account?.address} />
    </main>
  );
}

// ── Stat display card ──────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-4 bg-purple-50 border border-purple-100 rounded-xl">
      <dt className="text-xs text-gray-500 font-medium mb-1 text-center">{label}</dt>
      <dd className="text-2xl font-bold text-purple-700">{value}</dd>
    </div>
  );
}
