'use client';

/**
 * LF-313 · useRoundEvents
 *
 * Polls `getEvents` for a single round's lobby events (RoundJoined,
 * PlayerReady, RoundStarted).  The polling interval is managed by React Query
 * (`use-chain-queries.ts`) so that:
 *
 *   - All round-related queries share the same stale / refetch lifecycle.
 *   - Polling automatically pauses while the browser tab is hidden.
 *   - After a mutation the caller can call `invalidateRoundQueries()` and this
 *     hook re-fetches immediately instead of waiting for the next tick.
 */

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { nativeToScVal, rpc, scValToNative } from '@stellar/stellar-sdk';
import { createConfig } from '@/lib/stellar/stellarConfig';
import { QUERY_KEYS } from './use-chain-queries';

export interface RoundEventsState {
  /** Players seen in `RoundJoined` events. */
  joined: string[];
  /** Players seen in `PlayerReady` events. */
  ready: string[];
  /** True once a `RoundStarted` event has been observed. */
  started: boolean;
  error: string | null;
}

// How far back to look on the first poll (~1 day of ledgers at ~5s each).
const LOOKBACK_LEDGERS = 17280;
const TOPIC_ROUND_JOINED = 'round_joined';
const TOPIC_PLAYER_READY = 'player_ready';
const TOPIC_ROUND_STARTED = 'round_started';

// Polling intervals (match use-chain-queries.ts for consistency)
const POLL_FAST_MS = 4_000;
const POLL_SLOW_MS = 15_000;

/** Fetches all events for a round since `cursor` (or from `startLedger`). */
async function fetchRoundEvents(
  roundId: bigint,
  cursor: string | null,
): Promise<{ events: rpc.Api.EventResponse[]; cursor: string }> {
  const config = createConfig();
  const server = new rpc.Server(config.rpcUrl, {
    allowHttp: config.rpcUrl.startsWith('http://'),
  });
  const filters: rpc.Api.EventFilter[] = [
    {
      type: 'contract',
      contractIds: [config.lyricsflipContractId],
      topics: [
        ['*', nativeToScVal(roundId, { type: 'u64' }).toXDR('base64'), '*'],
      ],
    },
  ];

  let response: rpc.Api.GetEventsResponse;
  if (cursor) {
    response = await server.getEvents({ filters, cursor });
  } else {
    const { sequence } = await server.getLatestLedger();
    response = await server.getEvents({
      filters,
      startLedger: Math.max(1, sequence - LOOKBACK_LEDGERS),
    });
  }
  return { events: response.events, cursor: response.cursor };
}

/**
 * Polls `getEvents` for the lobby events of a single round (`RoundJoined`,
 * `PlayerReady`, `RoundStarted`), filtered by contract id and round-id topic.
 *
 * Uses React Query for the polling lifecycle so that:
 *   - Tab-hidden pausing is built-in (`refetchIntervalInBackground: false`).
 *   - Callers can call `queryClient.invalidateQueries(QUERY_KEYS.round(id))`
 *     after a mutation and this hook picks it up on the next tick.
 */
export function useRoundEvents(roundId: bigint | null): RoundEventsState {
  // Accumulate events across polls — React Query refetches give us deltas via
  // the cursor, which we keep in a ref so it survives re-renders without
  // triggering a new query.
  const cursorRef = useRef<string | null>(null);
  const accumulatedRef = useRef<{
    joined: Set<string>;
    ready: Set<string>;
    started: boolean;
  }>({ joined: new Set(), ready: new Set(), started: false });

  // Reset accumulator when roundId changes.
  const prevRoundIdRef = useRef<bigint | null>(null);
  if (roundId !== prevRoundIdRef.current) {
    prevRoundIdRef.current = roundId;
    cursorRef.current = null;
    accumulatedRef.current = { joined: new Set(), ready: new Set(), started: false };
  }

  const query = useQuery<RoundEventsState, Error>({
    // Share the query-key namespace with use-chain-queries so callers can
    // invalidate everything at once.  We use a sub-key so the events cache
    // is distinct from the round-object cache.
    queryKey: roundId
      ? [...QUERY_KEYS.round(roundId), 'events']
      : ['round', null, 'events'],
    queryFn: async (): Promise<RoundEventsState> => {
      if (roundId === null) {
        return { joined: [], ready: [], started: false, error: null };
      }

      const { events, cursor } = await fetchRoundEvents(
        roundId,
        cursorRef.current,
      );
      cursorRef.current = cursor;

      const acc = accumulatedRef.current;
      for (const event of events) {
        const [name, , address] = event.topic.map((t) => scValToNative(t));
        if (name === TOPIC_ROUND_JOINED) acc.joined.add(String(address));
        else if (name === TOPIC_PLAYER_READY) acc.ready.add(String(address));
        else if (name === TOPIC_ROUND_STARTED) acc.started = true;
      }

      return {
        joined: Array.from(acc.joined),
        ready: Array.from(acc.ready),
        started: acc.started,
        error: null,
      };
    },
    enabled: roundId !== null,
    refetchInterval: (query) => {
      // Back off once the round has started
      const data = query.state.data;
      if (!data) return POLL_FAST_MS;
      return data.started ? POLL_SLOW_MS : POLL_FAST_MS;
    },
    // Pause polling when the browser tab is not visible — this is the primary
    // fix for the "doubles RPC load" problem described in LF-313.
    refetchIntervalInBackground: false,
    staleTime: 2_000,
    // Keep the previous data while refetching so the UI doesn't flash.
    placeholderData: (prev) => prev,
  });

  return query.data ?? { joined: [], ready: [], started: false, error: null };
}
