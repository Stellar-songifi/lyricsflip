'use client';

/**
 * LF-313 · Consolidated React Query hooks for Soroban chain data.
 *
 * Rules:
 *  - Each distinct piece of chain data has exactly one canonical query key,
 *    defined in QUERY_KEYS below.
 *  - Polling uses `refetchInterval` with exponential backoff and pauses while
 *    the tab is hidden (`refetchIntervalInBackground: false`).
 *  - After every mutation, the caller (or `withTxToast`) should call
 *    `invalidateRoundQueries(roundId, queryClient)` / the helpers below so
 *    that all subscribers re-fetch once instead of waiting for the next tick.
 *  - The multiplayer page imports these hooks instead of running its own
 *    `setInterval` polling, so at most one RPC simulation fires per interval.
 */

import {
  useQuery,
  useQueryClient,
  type UseQueryOptions,
  type QueryClient,
} from '@tanstack/react-query';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import type { Round, PlayerStats } from '@/lib/stellar/types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const QUERY_KEYS = {
  round: (id: bigint) => ['round', id.toString()] as const,
  roundPlayers: (id: bigint) => ['roundPlayers', id.toString()] as const,
  openRounds: (page: number) => ['openRounds', page] as const,
  playerStats: (addr: string) => ['playerStats', addr] as const,
} as const;

// ---------------------------------------------------------------------------
// Polling backoff helper
//
// The first few refreshes use a short interval so the UI feels responsive;
// once the round is in a stable "started" or "completed" state we back off
// to avoid hammering the RPC.
// ---------------------------------------------------------------------------

const POLL_FAST_MS = 4_000; // while lobby / waiting
const POLL_SLOW_MS = 15_000; // while playing / stable

function roundRefetchInterval(data: Round | undefined): number | false {
  if (!data) return POLL_FAST_MS;
  if (data.is_completed || data.is_cancelled) return false; // terminal — stop polling
  if (data.is_started) return POLL_SLOW_MS;
  return POLL_FAST_MS;
}

// ---------------------------------------------------------------------------
// useRoundQuery
// ---------------------------------------------------------------------------

/**
 * Fetches a single round from the chain and keeps it fresh with backoff
 * polling.  Pauses automatically while the browser tab is hidden.
 */
export function useRoundQuery(
  roundId: bigint | null,
  options?: Partial<UseQueryOptions<Round, Error>>,
) {
  const { systemCalls } = useStellar();

  return useQuery<Round, Error>({
    queryKey: roundId ? QUERY_KEYS.round(roundId) : ['round', null],
    queryFn: async () => {
      if (!systemCalls || roundId === null)
        throw new Error('systemCalls not ready');
      return systemCalls.getRound(roundId);
    },
    enabled: !!systemCalls && roundId !== null,
    refetchInterval: (query) => roundRefetchInterval(query.state.data),
    // Pause polling while the tab is hidden — prevents doubled RPC load
    // when the user switches away and comes back.
    refetchIntervalInBackground: false,
    staleTime: 2_000,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// useRoundPlayersQuery
// ---------------------------------------------------------------------------

/**
 * Fetches the player list for a round with the same backoff/visibility
 * strategy as `useRoundQuery`.
 */
export function useRoundPlayersQuery(
  roundId: bigint | null,
  round?: Round,
  options?: Partial<UseQueryOptions<string[], Error>>,
) {
  const { systemCalls } = useStellar();

  return useQuery<string[], Error>({
    queryKey: roundId ? QUERY_KEYS.roundPlayers(roundId) : ['roundPlayers', null],
    queryFn: async () => {
      if (!systemCalls || roundId === null)
        throw new Error('systemCalls not ready');
      return systemCalls.getRoundPlayers(roundId);
    },
    enabled: !!systemCalls && roundId !== null,
    refetchInterval: round
      ? () => roundRefetchInterval(round)
      : POLL_FAST_MS,
    refetchIntervalInBackground: false,
    staleTime: 2_000,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// usePlayerStatsQuery
// ---------------------------------------------------------------------------

/**
 * Fetches on-chain stats for a single player address.  Polling is slower
 * since stats only change after a completed round.
 */
export function usePlayerStatsQuery(
  address: string | null | undefined,
  options?: Partial<UseQueryOptions<PlayerStats, Error>>,
) {
  const { systemCalls } = useStellar();

  return useQuery<PlayerStats, Error>({
    queryKey: address ? QUERY_KEYS.playerStats(address) : ['playerStats', null],
    queryFn: async () => {
      if (!systemCalls || !address)
        throw new Error('systemCalls not ready');
      return systemCalls.getPlayerStat(address);
    },
    enabled: !!systemCalls && !!address,
    refetchInterval: POLL_SLOW_MS,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Invalidation helpers — call these after every mutation
// ---------------------------------------------------------------------------

/**
 * Invalidates all cached data related to a specific round.  Call this inside
 * `withTxToast` after every mutating transaction (join, ready, submit answer…)
 * so every subscriber refreshes once rather than waiting for the next polling
 * tick.
 */
export async function invalidateRoundQueries(
  roundId: bigint,
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.round(roundId) }),
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.roundPlayers(roundId),
    }),
  ]);
}

/**
 * Invalidates the player-stats cache for a given address.  Call this after a
 * round completes or a reward is claimed.
 */
export async function invalidatePlayerStats(
  address: string,
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: QUERY_KEYS.playerStats(address),
  });
}

/**
 * Returns a convenience object with pre-bound invalidation functions for a
 * specific round.  Useful inside mutation callbacks:
 *
 * ```ts
 * const invalidators = useRoundInvalidators(roundId);
 * await systemCalls.joinRound(roundId);
 * await invalidators.round();
 * ```
 */
export function useRoundInvalidators(roundId: bigint | null) {
  const queryClient = useQueryClient();

  return {
    round: () =>
      roundId ? invalidateRoundQueries(roundId, queryClient) : Promise.resolve(),
    playerStats: (address: string) =>
      invalidatePlayerStats(address, queryClient),
  };
}
