'use client';

/**
 * useOpenRounds — LF-194 (issue #680)
 *
 * Reads the contract's `get_open_rounds` list and keeps it fresh while the
 * multiplayer lobby is open. The lobby must not require players to paste a
 * round id, and a lobby created in one browser has to show up in another
 * within 10 s.
 *
 * The list is polled on an interval, and lobby events
 * (`RoundCreated` / `RoundJoined` / `RoundStarted` / `RoundCancelled`) are
 * polled on a shorter interval so a join/start/cancel refreshes the list
 * immediately instead of waiting for the next tick.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { nativeToScVal, rpc, scValToNative } from '@stellar/stellar-sdk';
import { createConfig } from '@/lib/stellar/stellar-config';
import { queryKeys } from '@/lib/react-query';
import type { SystemCalls } from '@/lib/stellar/client';
import type { Round } from '@/lib/stellar/types';

/** Contract events that change the set of joinable rounds. */
const LOBBY_EVENTS = [
  'round_created',
  'round_joined',
  'round_started',
  'round_cancelled',
] as const;

/** How often the full list is re-read (acceptance: visible within 10 s). */
export const OPEN_ROUNDS_POLL_MS = 10_000;
/** How often lobby events are checked so changes show up immediately. */
export const LOBBY_EVENTS_POLL_MS = 4_000;
/** `get_open_rounds` is clamped to the contract's MAX_PAGE_LIMIT (50). */
export const MAX_OPEN_ROUNDS = 50;
/** Lobbies nobody started within this window are hidden as stale. */
export const LOBBY_TTL_SECONDS = 30 * 60;
/** How far back to look for `RoundCreated` events on the first poll (~1 day). */
const LOOKBACK_LEDGERS = 17280;

export interface OpenRound {
  round: Round;
  players: string[];
  playerCount: number;
  maxPlayers: number;
  /** Ledger time of `RoundCreated`, or null when the event was not observed. */
  createdAtSeconds: number | null;
  isFull: boolean;
  isExpired: boolean;
}

export interface UseOpenRoundsOptions {
  systemCalls: SystemCalls | null;
  limit?: number;
  pollIntervalMs?: number;
}

export interface UseOpenRoundsResult {
  rounds: OpenRound[];
  isLoading: boolean;
  error: string | null;
  /** Unix ms of the last successful refresh. */
  lastUpdatedAt: number | null;
  refresh: () => Promise<void>;
}

const asSeconds = (value: unknown): number | null => {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
};

const createdTimeOf = (value: unknown): number | null => {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return asSeconds(record.created_time);
};

const roundIdOf = (value: unknown): bigint | null => {
  const seconds = asSeconds(value);
  if (seconds === null) return null;
  try {
    return BigInt(seconds);
  } catch {
    return null;
  }
};

export function useOpenRounds({
  systemCalls,
  limit = MAX_OPEN_ROUNDS,
  pollIntervalMs = OPEN_ROUNDS_POLL_MS,
}: UseOpenRoundsOptions): UseOpenRoundsResult {
  const queryClient = useQueryClient();

  // Wall-clock seconds per round, filled from `RoundCreated` events. The
  // `Round` struct has no created-at field, so this is the only way to show an
  // age and to hide stale lobbies.
  const createdAtRef = useRef<Map<string, number>>(new Map());
  const eventCursorRef = useRef<string | null>(null);

  const queryKey = queryKeys.openRounds(limit);

  const query = useQuery({
    queryKey,
    enabled: systemCalls !== null,
    refetchInterval: pollIntervalMs,
    queryFn: async (): Promise<OpenRound[]> => {
      if (!systemCalls) return [];
      const [ids, maxPlayers] = await Promise.all([
        systemCalls.getOpenRounds(0, limit),
        systemCalls.getMaxPlayers(),
      ]);

      const createdTimes = createdAtRef.current;
      const nowSeconds = Math.floor(Date.now() / 1000);

      const enriched = await Promise.all(
        ids.map(async (roundId): Promise<OpenRound | null> => {
          try {
            const [round, players] = await Promise.all([
              systemCalls.getRound(roundId),
              systemCalls.getRoundPlayers(roundId),
            ]);
            // The contract list is a snapshot: a round may have started or
            // been cancelled between the two calls.
            if (round.is_started || round.is_cancelled || round.is_completed) {
              return null;
            }
            const createdAtSeconds = createdTimes.get(roundId.toString()) ?? null;
            const isExpired =
              createdAtSeconds !== null &&
              nowSeconds - createdAtSeconds > LOBBY_TTL_SECONDS;
            return {
              round,
              players,
              playerCount: players.length,
              maxPlayers,
              createdAtSeconds,
              isFull: players.length >= maxPlayers,
              isExpired,
            };
          } catch {
            // A single unreadable round must not blank the whole lobby.
            return null;
          }
        }),
      );

      // The contract stores open rounds in a count-plus-slot layout, so the
      // order of `get_open_rounds` is not stable across calls (slots are
      // reused after a round is removed or cleaned up). Sort by id for a
      // deterministic UI order, and drop ids that vanished between the list
      // read and the per-round reads.
      return enriched
        .filter((entry): entry is OpenRound => entry !== null)
        .filter((entry) => !entry.isExpired && !entry.isFull)
        .sort((a, b) => Number(a.round.round_id - b.round.round_id));
    },
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // Lobby-event polling: invalidates the cached list as soon as anything
  // changes, instead of waiting for the next refetch interval.
  useEffect(() => {
    if (!systemCalls) return;

    const config = createConfig();
    const server = new rpc.Server(config.rpcUrl, {
      allowHttp: config.rpcUrl.startsWith('http://'),
    });
    const filters: rpc.Api.EventFilter[] = LOBBY_EVENTS.map((name) => ({
      type: 'contract',
      contractIds: [config.lyricsflipContractId],
      topics: [[nativeToScVal(name, { type: 'symbol' }).toXDR('base64')]],
    }));

    let cancelled = false;

    const poll = async () => {
      try {
        let response: rpc.Api.GetEventsResponse;
        if (eventCursorRef.current) {
          response = await server.getEvents({
            filters,
            cursor: eventCursorRef.current,
          });
        } else {
          const { sequence } = await server.getLatestLedger();
          response = await server.getEvents({
            filters,
            startLedger: Math.max(1, sequence - LOOKBACK_LEDGERS),
          });
        }
        if (cancelled) return;
        eventCursorRef.current = response.cursor;

        for (const event of response.events) {
          const [name, roundIdRaw] = event.topic.map((topic) =>
            scValToNative(topic),
          );
          if (name !== 'round_created') continue;
          const roundId = roundIdOf(roundIdRaw);
          const createdAt = createdTimeOf(scValToNative(event.value));
          if (roundId !== null && createdAt !== null) {
            createdAtRef.current.set(roundId.toString(), createdAt);
          }
        }

        if (response.events.length > 0) {
          // Any lobby event may have removed a round (cancel, start, or the
          // contract's expired-lobby cleanup), so always re-read the list.
          await queryClient.invalidateQueries({ queryKey });
        }
      } catch {
        // Event polling is best-effort; the interval poll still refreshes.
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, LOBBY_EVENTS_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [systemCalls, queryClient, queryKey]);

  return {
    rounds: query.data ?? [],
    isLoading: systemCalls !== null && query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Failed to load open rounds'
      : null,
    lastUpdatedAt: query.dataUpdatedAt || null,
    refresh,
  };
}
