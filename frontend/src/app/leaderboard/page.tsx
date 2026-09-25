'use client';

/**
 * /leaderboard page
 *
 * Shows ranked player stats pulled from the backend via `useLeaderboard`.
 * Supports global / weekly / by-genre filters and paginated results.
 *
 * Part of Issue #471 / LF-054.
 */

import { useState } from 'react';
import { useLeaderboard, type LeaderboardFilter } from '@/hooks/useLeaderboard';
import { GENRE_VALUES } from '@/lib/stellar/types';
import { ArrowLeft, ArrowRight, Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';

const ITEMS_PER_PAGE = 20;

// Filters shown in the tab bar
const FILTER_TABS: { label: string; value: LeaderboardFilter }[] = [
  { label: 'Global', value: 'global' },
  { label: 'Weekly', value: 'weekly' },
  ...GENRE_VALUES.map((g) => ({ label: g, value: g })),
];

export default function LeaderboardPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<LeaderboardFilter>('global');
  const [page, setPage] = useState(1);

  // Reset to page 1 when filter changes
  const handleFilterChange = (value: LeaderboardFilter) => {
    setFilter(value);
    setPage(1);
  };

  const { data, isLoading, isError, error, isFetching } = useLeaderboard({
    filter,
    page,
    limit: ITEMS_PER_PAGE,
  });

  return (
    <main
      className="container mx-auto px-4 py-8 mt-16 lg:mt-24 max-w-4xl"
      aria-label="Leaderboard"
    >
      {/* Back */}
      <button
        onClick={() => router.push('/')}
        className="flex items-center text-gray-600 mb-6 focus-visible:ring-2 focus-visible:ring-purple-500 rounded"
        aria-label="Back to home"
      >
        <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
        Back
      </button>

      {/* Heading */}
      <div className="flex items-center gap-3 mb-6">
        <Trophy className="h-7 w-7 text-purple-600" aria-hidden="true" />
        <h1 className="text-3xl font-bold text-gray-900">Leaderboard</h1>
      </div>

      {/* Filter tabs (horizontal scroll on mobile) */}
      <div
        className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide"
        role="tablist"
        aria-label="Leaderboard filters"
      >
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={filter === tab.value}
            onClick={() => handleFilterChange(tab.value)}
            className={[
              'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors',
              'focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none',
              filter === tab.value
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div role="status" aria-label="Loading leaderboard" className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-14" aria-hidden="true" />
          ))}
          <span className="sr-only">Loading leaderboard…</span>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <p className="font-medium">Failed to load leaderboard</p>
          <p className="text-sm mt-1">{error?.message ?? 'An unexpected error occurred.'}</p>
          <p className="text-sm mt-1 text-gray-500">
            The backend leaderboard API may not be available yet. On-chain stats will be
            exposed once the indexer (LF-089) is running.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && data?.entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Trophy className="h-16 w-16 text-gray-300 mb-4" aria-hidden="true" />
          <p className="text-gray-500 font-medium">No entries yet</p>
          <p className="text-gray-400 text-sm mt-1">
            Play some rounds to appear on the leaderboard!
          </p>
        </div>
      )}

      {/* Leaderboard table */}
      {!isLoading && !isError && data && data.entries.length > 0 && (
        <>
          {/* Refetching indicator */}
          {isFetching && (
            <p role="status" aria-live="polite" className="text-xs text-gray-400 mb-2 text-right">
              Updating…
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
            <table
              className="w-full text-sm"
              aria-label={`Leaderboard – ${filter} – page ${page}`}
            >
              <thead className="bg-purple-50 text-purple-800 text-xs uppercase tracking-wide">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left w-12">
                    Rank
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    Player
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Rounds Won
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Max Streak
                  </th>
                  <th scope="col" className="px-4 py-3 text-right hidden sm:table-cell">
                    Total Rounds
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.entries.map((entry) => (
                  <tr
                    key={entry.address || entry.rank}
                    className="hover:bg-purple-50 transition-colors"
                  >
                    {/* Rank */}
                    <td className="px-4 py-3 font-bold text-gray-700">
                      {entry.rank <= 3 ? (
                        <span
                          className={[
                            'inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold',
                            entry.rank === 1
                              ? 'bg-yellow-400'
                              : entry.rank === 2
                              ? 'bg-gray-400'
                              : 'bg-amber-600',
                          ].join(' ')}
                          aria-label={`Rank ${entry.rank}`}
                        >
                          {entry.rank}
                        </span>
                      ) : (
                        <span className="text-gray-500">{entry.rank}</span>
                      )}
                    </td>

                    {/* Player */}
                    <td className="px-4 py-3">
                      {entry.username ? (
                        <span className="font-medium text-gray-900">{entry.username}</span>
                      ) : (
                        <span
                          className="font-mono text-gray-500 text-xs"
                          title={entry.address}
                          aria-label={`Wallet ${entry.address}`}
                        >
                          {entry.address
                            ? `${entry.address.slice(0, 6)}…${entry.address.slice(-4)}`
                            : '—'}
                        </span>
                      )}
                    </td>

                    {/* Rounds Won */}
                    <td className="px-4 py-3 text-right font-semibold text-purple-700">
                      {entry.rounds_won.toLocaleString()}
                    </td>

                    {/* Max Streak */}
                    <td className="px-4 py-3 text-right text-gray-700">
                      {entry.max_streak.toLocaleString()}
                    </td>

                    {/* Total Rounds */}
                    <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">
                      {entry.total_rounds.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div
              className="flex items-center justify-between mt-4"
              role="navigation"
              aria-label="Leaderboard pagination"
            >
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-purple-500"
                aria-label="Previous page"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </button>

              <span className="text-sm text-gray-500" aria-live="polite">
                Page {page} of {data.totalPages}
                <span className="sr-only"> ({data.total} total entries)</span>
              </span>

              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-purple-500"
                aria-label="Next page"
              >
                Next
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
