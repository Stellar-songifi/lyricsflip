'use client';

import { useEffect, useRef, useState } from 'react';
import { nativeToScVal, rpc, scValToNative } from '@stellar/stellar-sdk';
import { createConfig } from '@/lib/stellar/stellar-config';
import { createSystemCalls, type SystemCalls } from '@/lib/stellar/client';

export interface RoundEventsState {
  /** Players currently in the round (seeded from getRoundPlayers and updated by RoundJoined / RoundLeft events). */
  joined: string[];
  /** Players seen in `PlayerReady` events. */
  ready: string[];
  /** True once a `RoundStarted` event has been observed or round is started. */
  started: boolean;
  /** True once a `RoundCancelled` event has been observed or round is cancelled. */
  cancelled: boolean;
  error: string | null;
  /** Unix ms of the last successful update. */
  lastUpdatedAt: number | null;
}

export const BASE_POLL_INTERVAL_MS = 4000;
export const MAX_BACKOFF_MS = 32000;
// How far back to look on the first poll (~1 day of ledgers at ~5s each).
const LOOKBACK_LEDGERS = 17280;

const TOPIC_ROUND_JOINED = 'round_joined';
const TOPIC_PLAYER_READY = 'player_ready';
const TOPIC_ROUND_STARTED = 'round_started';
const TOPIC_ROUND_LEFT = 'round_left';
const TOPIC_ROUND_CANCELLED = 'round_cancelled';

export interface UseRoundEventsOptions {
  /** Base poll interval in milliseconds (default 4000ms). */
  pollIntervalMs?: number;
  /** Maximum backoff interval in milliseconds (default 32000ms). */
  maxBackoffMs?: number;
  /** Optional RPC server instance (useful for unit testing). */
  server?: rpc.Server;
  /** Optional systemCalls provider or mock for getRound and getRoundPlayers. */
  systemCalls?: Pick<SystemCalls, 'getRound' | 'getRoundPlayers'>;
}

/**
 * Polls `getEvents` for the lobby events of a single round (`RoundJoined`,
 * `PlayerReady`, `RoundStarted`, `RoundLeft`, `RoundCancelled`).
 *
 * Seeds initial state from `getRoundPlayers` and `getRound` so that lobbies
 * created more than 1 day ago display the correct players. Backs off
 * exponentially on network errors and stops polling once the round has
 * started or been cancelled.
 */
export function useRoundEvents(
  roundId: bigint | null,
  options?: UseRoundEventsOptions,
): RoundEventsState {
  const [state, setState] = useState<RoundEventsState>({
    joined: [],
    ready: [],
    started: false,
    cancelled: false,
    error: null,
    lastUpdatedAt: null,
  });
  const cursorRef = useRef<string | null>(null);

  const pollIntervalMs = options?.pollIntervalMs ?? BASE_POLL_INTERVAL_MS;
  const maxBackoffMs = options?.maxBackoffMs ?? MAX_BACKOFF_MS;
  const customServer = options?.server;
  const customSystemCalls = options?.systemCalls;

  useEffect(() => {
    if (roundId === null) {
      setState({
        joined: [],
        ready: [],
        started: false,
        cancelled: false,
        error: null,
        lastUpdatedAt: null,
      });
      return;
    }

    const config = createConfig();
    const server =
      customServer ??
      new rpc.Server(config.rpcUrl, {
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

    let isDisposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let currentInterval = pollIntervalMs;
    cursorRef.current = null;

    // Track active players and ready state using Sets for clean delta application
    const joinedSet = new Set<string>();
    const readySet = new Set<string>();
    let isStarted = false;
    let isCancelled = false;

    setState({
      joined: [],
      ready: [],
      started: false,
      cancelled: false,
      error: null,
      lastUpdatedAt: null,
    });

    const schedulePoll = (delay: number) => {
      if (isDisposed || isStarted || isCancelled) return;
      pollTimer = setTimeout(() => {
        void poll();
      }, delay);
    };

    const poll = async () => {
      if (isDisposed || isStarted || isCancelled) return;

      try {
        let response: rpc.Api.GetEventsResponse;
        if (cursorRef.current) {
          response = await server.getEvents({
            filters,
            cursor: cursorRef.current,
          });
        } else {
          const { sequence } = await server.getLatestLedger();
          response = await server.getEvents({
            filters,
            startLedger: Math.max(1, sequence - LOOKBACK_LEDGERS),
          });
        }

        if (isDisposed) return;
        cursorRef.current = response.cursor;

        for (const event of response.events) {
          const [rawName, , address] = event.topic.map((t) => scValToNative(t));
          const name = String(rawName).toLowerCase();
          const addr = address ? String(address) : '';

          if (name === TOPIC_ROUND_JOINED || name === 'roundjoined') {
            if (addr) joinedSet.add(addr);
          } else if (name === TOPIC_ROUND_LEFT || name === 'roundleft') {
            if (addr) {
              joinedSet.delete(addr);
              readySet.delete(addr);
            }
          } else if (name === TOPIC_PLAYER_READY || name === 'playerready') {
            if (addr) readySet.add(addr);
          } else if (name === TOPIC_ROUND_STARTED || name === 'roundstarted') {
            isStarted = true;
          } else if (name === TOPIC_ROUND_CANCELLED || name === 'roundcancelled') {
            isCancelled = true;
          }
        }

        setState({
          joined: Array.from(joinedSet),
          ready: Array.from(readySet),
          started: isStarted,
          cancelled: isCancelled,
          error: null,
          lastUpdatedAt: Date.now(),
        });

        // Reset backoff on success
        currentInterval = pollIntervalMs;

        // If round is started or cancelled, stop polling; otherwise schedule next poll
        if (!isStarted && !isCancelled) {
          schedulePoll(currentInterval);
        }
      } catch (err) {
        if (isDisposed) return;
        setState((prev) => ({
          ...prev,
          error:
            err instanceof Error ? err.message : 'Failed to fetch round events',
        }));

        // Backoff exponentially on error
        currentInterval = Math.min(currentInterval * 2, maxBackoffMs);
        schedulePoll(currentInterval);
      }
    };

    // Seed initial state from contract views, then start event polling
    const seedAndStart = async () => {
      try {
        const system =
          customSystemCalls ?? createSystemCalls(config, null);
        const [roundData, roundPlayers] = await Promise.all([
          system.getRound(roundId).catch(() => null),
          system.getRoundPlayers(roundId).catch(() => []),
        ]);

        if (isDisposed) return;

        if (roundPlayers && Array.isArray(roundPlayers)) {
          for (const p of roundPlayers) {
            joinedSet.add(String(p));
          }
        }
        if (roundData?.is_started) {
          isStarted = true;
        }
        if (roundData?.is_cancelled) {
          isCancelled = true;
        }

        setState({
          joined: Array.from(joinedSet),
          ready: Array.from(readySet),
          started: isStarted,
          cancelled: isCancelled,
          error: null,
          lastUpdatedAt: Date.now(),
        });

        // If already started or cancelled, no need to poll events
        if (isStarted || isCancelled) {
          return;
        }
      } catch {
        // Fall back to polling if seed call fails
      }

      if (!isDisposed && !isStarted && !isCancelled) {
        void poll();
      }
    };

    void seedAndStart();

    return () => {
      isDisposed = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [roundId, pollIntervalMs, maxBackoffMs, customServer, customSystemCalls]);

  return state;
}
