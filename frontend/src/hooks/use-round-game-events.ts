'use client';

/**
 * useRoundGameEvents — LF-195 (issue #681)
 *
 * Live scoreboard data for a multiplayer round. The contract publishes
 * `AnswerSubmitted` (player, correct, points) for every answer and
 * `RoundCompleted` (winners, scores) when the round is finalized, so the game
 * screen does not need to poll every player's score individually.
 *
 * The cursor-based `getEvents` stream is polled every
 * {@link GAME_EVENTS_POLL_MS} so both browsers see each answer within one
 * polling interval, which is the acceptance criterion of LF-195.
 */

import { useEffect, useRef, useState } from 'react';
import { nativeToScVal, rpc, scValToNative } from '@stellar/stellar-sdk';
import { createConfig } from '@/lib/stellar/stellar-config';

/** How often the round's game events are polled. */
export const GAME_EVENTS_POLL_MS = 4_000;
/** How far back to look on the first poll (~1 day of ledgers at ~5s each). */
const LOOKBACK_LEDGERS = 17_280;
/** Soroban RPC's maximum number of events returned per `getEvents` call. */
const PAGE_LIMIT = 100;
/** Bound on how many pages a single poll walks, so a long round cannot stall. */
const MAX_PAGES = 5;

const TOPIC_ANSWER_SUBMITTED = 'answer_submitted';
const TOPIC_ROUND_COMPLETED = 'round_completed';

export interface RoundGameEventsState {
  /** Points per player, summed from every `AnswerSubmitted` event. */
  scores: Record<string, number>;
  /** Cards answered per player (one `AnswerSubmitted` per answered card). */
  answered: Record<string, number>;
  /** Winners reported by `RoundCompleted`, or `null` while the round is live. */
  winners: string[] | null;
  /** Scores reported by `RoundCompleted`, or `null` while the round is live. */
  finalScores: Record<string, number> | null;
  /** True once `RoundCompleted` has been observed. */
  completed: boolean;
  error: string | null;
  /** Unix ms of the last successful poll. */
  lastUpdatedAt: number | null;
}

const emptyState = (): RoundGameEventsState => ({
  scores: {},
  answered: {},
  winners: null,
  finalScores: null,
  completed: false,
  error: null,
  lastUpdatedAt: null,
});

/** `scValToNative` decodes a `Map<Address, u64>` to a JS `Map`. */
const scoresToRecord = (value: unknown): Record<string, number> => {
  const scores: Record<string, number> = {};
  if (value instanceof Map) {
    value.forEach((points, player) => {
      scores[String(player)] = Number(points);
    });
  } else if (value !== null && typeof value === 'object') {
    for (const [player, points] of Object.entries(
      value as Record<string, unknown>,
    )) {
      scores[player] = Number(points);
    }
  }
  return scores;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;

/**
 * Polls `answer_submitted` and `round_completed` events for one round and
 * reduces them into the scoreboard state the game screen renders.
 */
export function useRoundGameEvents(
  roundId: bigint | null,
  pollIntervalMs: number = GAME_EVENTS_POLL_MS,
): RoundGameEventsState {
  const [state, setState] = useState<RoundGameEventsState>(emptyState);
  const cursorRef = useRef<string | null>(null);
  // Running totals for the current cursor stream. Kept outside React state so
  // a failed poll can be retried from the same cursor without double counting.
  const totalsRef = useRef<{
    scores: Record<string, number>;
    answered: Record<string, number>;
    winners: string[] | null;
    finalScores: Record<string, number> | null;
    completed: boolean;
  }>({ scores: {}, answered: {}, winners: null, finalScores: null, completed: false });

  useEffect(() => {
    if (roundId === null) {
      setState(emptyState());
      return;
    }

    const config = createConfig();
    const server = new rpc.Server(config.rpcUrl, {
      allowHttp: config.rpcUrl.startsWith('http://'),
    });
    const roundTopic = nativeToScVal(roundId, { type: 'u64' }).toXDR('base64');
    const filters: rpc.Api.EventFilter[] = [
      {
        type: 'contract',
        contractIds: [config.lyricsflipContractId],
        topics: [
          [
            nativeToScVal(TOPIC_ANSWER_SUBMITTED, {
              type: 'symbol',
            }).toXDR('base64'),
            roundTopic,
            '*',
          ],
        ],
      },
      {
        type: 'contract',
        contractIds: [config.lyricsflipContractId],
        topics: [
          [
            nativeToScVal(TOPIC_ROUND_COMPLETED, {
              type: 'symbol',
            }).toXDR('base64'),
            roundTopic,
          ],
        ],
      },
    ];

    let cancelled = false;
    cursorRef.current = null;
    totalsRef.current = {
      scores: {},
      answered: {},
      winners: null,
      finalScores: null,
      completed: false,
    };
    setState(emptyState());

    const readPage = async (cursor: string | null) => {
      if (cursor) {
        return server.getEvents({ filters, cursor, limit: PAGE_LIMIT });
      }
      const { sequence } = await server.getLatestLedger();
      return server.getEvents({
        filters,
        startLedger: Math.max(1, sequence - LOOKBACK_LEDGERS),
        limit: PAGE_LIMIT,
      });
    };

    const poll = async () => {
      try {
        // Work on a copy so a failed page leaves both the cursor and the
        // committed totals untouched, and the next poll retries cleanly.
        const totals = {
          scores: { ...totalsRef.current.scores },
          answered: { ...totalsRef.current.answered },
          winners: totalsRef.current.winners,
          finalScores: totalsRef.current.finalScores,
          completed: totalsRef.current.completed,
        };

        let cursor = cursorRef.current;
        for (let page = 0; page < MAX_PAGES; page += 1) {
          const response = await readPage(cursor);
          if (cancelled) return;

          for (const event of response.events) {
            const [name, , player] = event.topic.map((topic) =>
              scValToNative(topic),
            );
            const value = asRecord(scValToNative(event.value));
            if (name === TOPIC_ANSWER_SUBMITTED) {
              const address = String(player ?? '');
              if (!address) continue;
              const points = Number(value?.points ?? 0);
              totals.scores[address] = (totals.scores[address] ?? 0) + points;
              totals.answered[address] = (totals.answered[address] ?? 0) + 1;
            } else if (name === TOPIC_ROUND_COMPLETED) {
              totals.completed = true;
              const rawWinners = value?.winners;
              totals.winners = Array.isArray(rawWinners)
                ? rawWinners.map((winner) => String(winner))
                : [];
              totals.finalScores = scoresToRecord(value?.scores);
            }
          }

          const nextCursor = response.cursor;
          const reachedEnd =
            response.events.length < PAGE_LIMIT || nextCursor === cursor;
          cursor = nextCursor;
          if (reachedEnd) break;
        }

        if (cancelled) return;
        cursorRef.current = cursor;
        totalsRef.current = totals;
        setState({
          ...totals,
          error: null,
          lastUpdatedAt: Date.now(),
        });
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          error:
            err instanceof Error
              ? err.message
              : 'Failed to load round events',
        }));
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [roundId, pollIntervalMs]);

  return state;
}
