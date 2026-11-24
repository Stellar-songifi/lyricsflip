'use client';

/**
 * useOpenRounds — LF-194 (issue #680), updated LF-356
 *
 * Reads the open-rounds list from the **backend cache** (LF-356) first so
 * the browser makes no direct Soroban RPC calls when the backend is up.
 * Falls back to the original RPC path when the backend is unreachable.
 *
 * Backend path  → GET /api/v1/rounds/open  (10 s Redis TTL + ETag)
 * Fallback path → contract `get_open_rounds` via Soroban RPC (original behaviour)
 *
 * The lobby must stay fresh: a round created in one browser shows up in
 * another within 10 s. With the backend path that is guaranteed by the
 * backend cache TTL + the frontend poll interval.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { nativeToScVal, rpc, scValToNative } from '@stellar/stellar-sdk';
import { createConfig } from '@/lib/stellar/stellar-config';
import { queryKeys } from '@/lib/react-query';
import { env } from '@/env';
import type { SystemCalls } from '@/lib/stellar/client';
import type { Round } from '@/lib/stellar/types';

// ─── Constants ───────────────────────────────────────────────────────────────

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

// ─── Backend response shape (mirrors RoundsReadService DTOs) ─────────────────

interface BackendRoundPlayer {
  address: string;
  ready: boolean;
  joinedLedger: number | null;
}

interface BackendOpenRound {
  roundId: string;
  admin: string | null;
  status: string | null;
  genre: string | null;
  players: BackendRoundPlayer[];
  playerCount: number;
  createdLedger: number | null;
  startedAt: string | null;
}

interface BackendOpenRoundsPage {
  data: BackendOpenRound[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Public interface ─────────────────────────────────────────────────────────

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
  /** True when this render used the backend cache; false = RPC fallback. */
  fromBackend: boolean;
}

// ─── ETag store (module-level, not per-render) ────────────────────────────────

let cachedEtag: string | null = null;

// ─── Backend fetch helper ─────────────────────────────────────────────────────

/**
 * Fetches the open-rounds list from the backend cache endpoint.
 * Sends the last-known ETag so unchanged data returns 304 / null.
 * Returns null on any network or non-2xx/304 error so the caller can fall back.
 */
async function fetchOpenRoundsFromBackend(
  limit: number,
): Promise<BackendOpenRoundsPage | null> {
  const baseUrl =
    (env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/api\/v1$/, '');
  const url = `${baseUrl}/api/v1/rounds/open?limit=${limit}&page=1`;

  try {
    const headers: HeadersInit = { Accept: 'application/json' };
    if (cachedEtag) {
      headers['If-None-Match'] = cachedEtag;
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });

    if (res.status === 304) {
      // Data unchanged; caller should use the previously cached React Query data.
      return null;
    }

    if (!res.ok) {
      return null;
    }

    const etag = res.headers.get('ETag');
    if (etag) cachedEtag = etag;

    return (await res.json()) as BackendOpenRoundsPage;
  } catch {
    // Network error, timeout, or backend unreachable — signal fallback.
    return null;
  }
}

// ─── Conversion: backend DTO → OpenRound ─────────────────────────────────────

/**
 * Adapts a backend `BackendOpenRound` to the `OpenRound` shape consumed by
 * the lobby UI. The `round` field is a minimal stub because on-chain `Round`
 * structs require an RPC call to fully populate; callers that need the full
 * struct should use `systemCalls.getRound()` individually.
 *
 * The `maxPlayers` value is not stored in the indexed table, so it defaults
 * to 4 (the contract's default). When an exact value is critical, the RPC
 * fallback provides it.
 */
function backendRoundToOpenRound(
  br: BackendOpenRound,
  nowSeconds: number,
  defaultMaxPlayers = 4,
): OpenRound {
  const roundIdBigInt = (() => {
    try {
      return BigInt(br.roundId);
    } catch {
      return BigInt(0);
    }
  })();

  // Minimal Round stub sufficient for the lobby list UI.
  // Fields not stored in the indexed table are given zero/false defaults.
  // Consumers that need the full on-chain struct should call
  // `systemCalls.getRound(roundId)` directly.
  const round: Round = {
    round_id: roundIdBigInt,
    admin: br.admin ?? '',
    is_started: br.status === 'started',
    is_cancelled: br.status === 'cancelled',
    is_completed: br.status === 'completed',
    genre: (br.genre ?? '') as Round['genre'],
    // Fields unavailable from the index — zero/false defaults
    wager_amount: BigInt(0),
    start_time: BigInt(0),
    end_time: BigInt(0),
    next_card_index: 0,
  } as Round;

  const createdAtSeconds: number | null = br.createdLedger
    ? null // ledger sequence, not seconds — we don't have wall-clock here
    : null;

  const isExpired =
    createdAtSeconds !== null &&
    nowSeconds - createdAtSeconds > LOBBY_TTL_SECONDS;

  const players = br.players.map((p) => p.address);

  return {
    round,
    players,
    playerCount: br.playerCount,
    maxPlayers: defaultMaxPlayers,
    createdAtSeconds,
    isFull: br.playerCount >= defaultMaxPlayers,
    isExpired,
  };
}

// ─── Utility helpers (unchanged from original) ────────────────────────────────

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOpenRounds({
  systemCalls,
  limit = MAX_OPEN_ROUNDS,
  pollIntervalMs = OPEN_ROUNDS_POLL_MS,
}: UseOpenRoundsOptions): UseOpenRoundsResult {
  const queryClient = useQueryClient();

  // Wall-clock seconds per round, filled from `RoundCreated` events.
  const createdAtRef = useRef<Map<string, number>>(new Map());
  const eventCursorRef = useRef<string | null>(null);
  const fromBackendRef = useRef<boolean>(false);

  const queryKey = [
    ...queryKeys.openRounds(createConfig().lyricsflipContractId),
    limit,
  ] as const;

  const query = useQuery({
    queryKey,
    // Allow running even without systemCalls so backend path works without wallet.
    enabled: true,
    refetchInterval: pollIntervalMs,
    queryFn: async (): Promise<OpenRound[]> => {
      const nowSeconds = Math.floor(Date.now() / 1000);

      // ── Primary path: backend cache ──────────────────────────────────────
      const backendPage = await fetchOpenRoundsFromBackend(limit);

      if (backendPage !== null) {
        // 200 response from backend — no RPC call needed.
        fromBackendRef.current = true;
        return backendPage.data
          .map((br) =>
            backendRoundToOpenRound(br, nowSeconds),
          )
          .filter((r) => !r.isExpired);
      }

      // 304 (unchanged data) → keep the existing React Query cache as-is.
      // `backendPage === null` with no previous data means first load with
      // an unchanged response — still counts as "from backend".
      if (cachedEtag !== null) {
        // The 304 means the data we already have is still current.
        fromBackendRef.current = true;
        const existing = queryClient.getQueryData<OpenRound[]>(queryKey);
        if (existing) return existing;
      }

      // ── Fallback path: Soroban RPC ────────────────────────────────────────
      // Reached only when the backend is unreachable or returns an error.
      if (!systemCalls) return [];

      fromBackendRef.current = false;

      const [ids, maxPlayers] = await Promise.all([
        systemCalls.getOpenRounds(0, limit),
        systemCalls.getMaxPlayers(),
      ]);

      const createdTimes = createdAtRef.current;

      const enriched = await Promise.all(
        ids.map(async (roundId): Promise<OpenRound | null> => {
          try {
            const [round, players] = await Promise.all([
              systemCalls.getRound(roundId),
              systemCalls.getRoundPlayers(roundId),
            ]);
            if (round.is_started || round.is_cancelled || round.is_completed) {
              return null;
            }
            const createdAtSeconds =
              createdTimes.get(roundId.toString()) ?? null;
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
            return null;
          }
        }),
      );

      return enriched
        .filter((entry): entry is OpenRound => entry !== null)
        .filter((entry) => !entry.isExpired && !entry.isFull)
        .sort((a, b) => Number(a.round.round_id - b.round.round_id));
    },
  });

  const refresh = useCallback(async () => {
    // Clear the ETag so the next request fetches a fresh copy from the backend.
    cachedEtag = null;
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // ── Lobby-event polling (RPC fallback only) ──────────────────────────────
  //
  // When the backend is up, the WebSocket gateway (`IndexerGateway`) pushes
  // `indexer:round:created` events over Socket.IO, so this polling loop is
  // not needed. We still run it when the backend is unreachable so the
  // fallback path keeps the same freshness as the original implementation.
  //
  // When `fromBackendRef.current` is true the loop still runs but bails early
  // on each tick (the `if (!systemCalls)` guard) so it costs only one boolean
  // check per interval.
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
      // Skip RPC polling while the backend is healthy — the backend's
      // IndexerGateway WebSocket covers event propagation, and the
      // regular refetchInterval keeps data current via the backend endpoint.
      if (fromBackendRef.current) return;

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
    isLoading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Failed to load open rounds'
      : null,
    lastUpdatedAt: query.dataUpdatedAt || null,
    refresh,
    fromBackend: fromBackendRef.current,
  };
}
