/**
 * useLeaderboard
 *
 * Fetches leaderboard data from the backend via `services/api.ts`.
 * Replaces the broken `/api/leaderboard` Next.js route call (LF-054 / #471).
 *
 * The backend exposes `GET /leaderboard` (see backend/src/leaderboard/).
 * Query params supported:
 *   - filter: 'global' | 'weekly' | genre slug (e.g. 'HipHop')
 *   - page: 1-based page number
 *   - limit: results per page (default 20)
 */

import { useQuery } from '@tanstack/react-query';
import { get } from '@/services/api';

// ── Types ──────────────────────────────────────────────────────────────────

export type LeaderboardFilter = 'global' | 'weekly' | string; // string covers genre slugs

export interface LeaderboardEntry {
  rank: number;
  address: string;
  /** Display name (off-chain, may be null if not set) */
  username: string | null;
  rounds_won: number;
  max_streak: number;
  total_rounds: number;
}

export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UseLeaderboardOptions {
  filter?: LeaderboardFilter;
  page?: number;
  limit?: number;
}

// ── API response shape (matches backend leaderboard controller) ────────────

interface ApiLeaderboardEntry {
  rank?: number;
  address?: string;
  /** Some backends return wallet address under different keys */
  walletAddress?: string;
  username?: string | null;
  roundsWon?: number;
  rounds_won?: number;
  maxStreak?: number;
  max_streak?: number;
  totalRounds?: number;
  total_rounds?: number;
}

interface ApiLeaderboardResponse {
  data?: ApiLeaderboardEntry[];
  /** Some backends return the array directly */
  entries?: ApiLeaderboardEntry[];
  total?: number;
  page?: number;
  limit?: number;
}

/** Normalise the backend response to the UI shape */
function normaliseEntry(entry: ApiLeaderboardEntry, index: number): LeaderboardEntry {
  return {
    rank: entry.rank ?? index + 1,
    address: entry.address ?? entry.walletAddress ?? '',
    username: entry.username ?? null,
    rounds_won: entry.roundsWon ?? entry.rounds_won ?? 0,
    max_streak: entry.maxStreak ?? entry.max_streak ?? 0,
    total_rounds: entry.totalRounds ?? entry.total_rounds ?? 0,
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useLeaderboard({
  filter = 'global',
  page = 1,
  limit = 20,
}: UseLeaderboardOptions = {}) {
  return useQuery<LeaderboardPage, Error>({
    queryKey: ['leaderboard', filter, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        filter,
        page: String(page),
        limit: String(limit),
      });

      const raw = await get<ApiLeaderboardResponse | ApiLeaderboardEntry[]>(
        `/leaderboard?${params.toString()}`,
      );

      // Handle both array and paginated-object responses
      if (Array.isArray(raw)) {
        const entries = raw.map(normaliseEntry);
        return {
          entries,
          total: entries.length,
          page,
          limit,
          totalPages: Math.ceil(entries.length / limit),
        };
      }

      const items = raw.data ?? raw.entries ?? [];
      const total = raw.total ?? items.length;
      return {
        entries: items.map(normaliseEntry),
        total,
        page: raw.page ?? page,
        limit: raw.limit ?? limit,
        totalPages: Math.ceil(total / (raw.limit ?? limit)),
      };
    },
    // Keep stale data visible while revalidating
    staleTime: 30_000, // 30 s
    // retry is intentionally not set here so callers and tests can
    // override it via the QueryClient defaultOptions.
  });
}
