'use client';

/**
 * /profile/[address] — Player profile and stats page (LF-058, #475)
 *
 * Shows:
 *  - Avatar (generated from address initials), username, truncated address
 *  - On-chain stats from `get_player_stat`: total rounds, rounds won,
 *    current streak, max streak, derived win rate
 *  - Edit username button (links to /set-username) when viewing own profile
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Trophy,
  Zap,
  Target,
  TrendingUp,
  Edit2,
  Copy,
  Check,
} from 'lucide-react';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { useProfileStore } from '@/store/useProfileStore';
import type { PlayerStats } from '@/lib/stellar/types';
import { Skeleton } from '@/components/atoms/Skeleton';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncate a Stellar address: first 6 + … + last 4 chars */
const truncateAddress = (addr: string) =>
  addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

/** Derive initials from a username or address for the avatar placeholder */
const getInitials = (nameOrAddress: string): string => {
  if (!nameOrAddress) return '?';
  const clean = nameOrAddress.replace(/[^a-zA-Z0-9]/g, '');
  if (clean.length === 0) return '?';
  return clean.slice(0, 2).toUpperCase();
};

/** Deterministic background colour from address (for the avatar) */
const addressToColor = (address: string): string => {
  const palette = [
    '#9747FF', // purplePrimary5
    '#70E3C7', // tealPrimary1
    '#4C2480', // purplePrimary4
    '#11624A', // tealPrimary2
    '#490878', // purplePrimary1
    '#0AC660', // greenSecondary1
  ];
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
};

const formatBigInt = (value: bigint | undefined): string =>
  value !== undefined ? value.toString() : '—';

const computeWinRate = (stats: PlayerStats): string => {
  const total = Number(stats.total_rounds);
  const won = Number(stats.rounds_won);
  if (total === 0) return '—';
  return `${Math.round((won / total) * 100)}%`;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
}

const StatCard = ({ icon, label, value, accent = 'text-purplePrimary5' }: StatCardProps) => (
  <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-2">
    <div className={`${accent} mb-1`}>{icon}</div>
    <p className="text-gray-500 dark:text-gray-400 text-sm">{label}</p>
    <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
  </div>
);

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const address = typeof params.address === 'string' ? params.address : '';

  const { account, systemCalls, isLoading: walletLoading } = useStellar();
  const { getUsername } = useProfileStore();

  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isOwnProfile = account?.address === address;
  const username = getUsername(address);

  // Fetch on-chain stats
  const fetchStats = useCallback(async () => {
    if (!address) return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      // Read-only: works without a connected wallet
      const sc = systemCalls;
      if (!sc) {
        // systemCalls not ready yet — will retry when it becomes available
        return;
      }
      const playerStats = await sc.getPlayerStat(address);
      setStats(playerStats);
    } catch (err) {
      setStatsError(
        err instanceof Error ? err.message : 'Failed to load on-chain stats',
      );
    } finally {
      setStatsLoading(false);
    }
  }, [address, systemCalls]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available (e.g. in SSR/test env)
    }
  };

  if (!address) {
    return (
      <div className="container mx-auto p-4 mt-28">
        <p className="text-red-500">Invalid profile address.</p>
      </div>
    );
  }

  const avatarBg = addressToColor(address);
  const initials = getInitials(username ?? address);

  return (
    <main className="container mx-auto max-w-4xl px-4 pb-24 mt-24 lg:mt-32">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-purplePrimary5 transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-sm">Back</span>
      </button>

      {/* Profile header card */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 md:p-8 mb-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          {/* Avatar */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0 select-none"
            style={{ backgroundColor: avatarBg }}
            aria-label={`Avatar for ${username ?? address}`}
          >
            {initials}
          </div>

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {username ?? 'Anonymous Player'}
              </h1>
              {isOwnProfile && (
                <Link
                  href="/set-username"
                  className="inline-flex items-center gap-1 text-xs text-purplePrimary5 border border-purplePrimary5 rounded-full px-2 py-0.5 hover:bg-purplePrimary5 hover:text-white transition-colors"
                  aria-label="Edit username"
                >
                  <Edit2 className="h-3 w-3" />
                  Edit
                </Link>
              )}
            </div>

            <button
              onClick={copyAddress}
              className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm hover:text-purplePrimary5 transition-colors mx-auto sm:mx-0"
              aria-label="Copy address"
            >
              <span className="font-mono">{truncateAddress(address)}</span>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>

            {isOwnProfile && (
              <span className="mt-2 inline-block text-xs bg-purplePrimary5/10 text-purplePrimary5 rounded-full px-3 py-0.5">
                Your profile
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats section */}
      <section aria-labelledby="stats-heading">
        <h2
          id="stats-heading"
          className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4"
        >
          On-chain Stats
        </h2>

        {statsError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-4 text-red-600 dark:text-red-400 text-sm">
            {statsError}
            <button
              onClick={fetchStats}
              className="ml-2 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {statsLoading ? (
            // Skeleton placeholders while loading
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700"
              >
                <Skeleton height="1.5rem" width="40%" className="mb-2" />
                <Skeleton height="1rem" width="60%" className="mb-3" />
                <Skeleton height="2rem" width="50%" />
              </div>
            ))
          ) : stats ? (
            <>
              <StatCard
                icon={<Target className="h-5 w-5" />}
                label="Total Rounds"
                value={formatBigInt(stats.total_rounds)}
              />
              <StatCard
                icon={<Trophy className="h-5 w-5" />}
                label="Rounds Won"
                value={formatBigInt(stats.rounds_won)}
                accent="text-yellow-500"
              />
              <StatCard
                icon={<TrendingUp className="h-5 w-5" />}
                label="Win Rate"
                value={computeWinRate(stats)}
                accent="text-tealPrimary1"
              />
              <StatCard
                icon={<Zap className="h-5 w-5" />}
                label="Current Streak"
                value={formatBigInt(stats.current_streak)}
                accent="text-orange-500"
              />
              <StatCard
                icon={<Zap className="h-5 w-5" />}
                label="Best Streak"
                value={formatBigInt(stats.max_streak)}
                accent="text-pink-500"
              />
            </>
          ) : (
            <p className="col-span-full text-gray-500 dark:text-gray-400 text-sm">
              No on-chain stats found for this address yet.
            </p>
          )}
        </div>
      </section>

      {/* CTA for own profile with no username */}
      {isOwnProfile && !username && (
        <div className="mt-8 bg-purplePrimary5/5 dark:bg-purplePrimary5/10 border border-purplePrimary5/20 rounded-2xl p-6 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-3">
            You haven&apos;t set a username yet.
          </p>
          <Link
            href="/set-username"
            className="inline-block bg-purplePrimary5 text-white px-6 py-2 rounded-full hover:bg-purplePrimary5/90 transition-colors"
          >
            Set Username
          </Link>
        </div>
      )}

      {/* Wallet not loading but no systemCalls — prompt to connect */}
      {!walletLoading && !systemCalls && (
        <p className="mt-6 text-sm text-gray-400 dark:text-gray-500 text-center">
          Connect your wallet to see live on-chain stats.
        </p>
      )}
    </main>
  );
}
