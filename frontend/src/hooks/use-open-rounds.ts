'use client';

import { useEffect, useState, useCallback } from 'react';
import { rpc, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import { createConfig } from '@/lib/stellar/stellarConfig';
import type { Round } from '@/lib/stellar/types';
import { genreFromWire } from '@/lib/stellar/types';

export interface OpenRound {
  round: Round;
  /** Seconds until the round expires (derived from Round.end_time). */
  secondsLeft: number;
  playerCount: number;
}

interface UseOpenRoundsResult {
  rounds: OpenRound[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

const POLL_INTERVAL_MS = 10_000;
// Look back ~1 day of ledgers to find recently created rounds.
const LOOKBACK_LEDGERS = 17280;
const TOPIC_ROUND_CREATED = 'round_created';

function secondsLeft(endTime: bigint): number {
  const nowSec = Math.floor(Date.now() / 1000);
  return Math.max(0, Number(endTime) - nowSec);
}

/**
 * Discovers open (non-started, non-cancelled, non-expired) rounds by
 * listening to `RoundCreated` contract events, then reading each round's
 * current state. Re-polls every 10 s.
 */
export function useOpenRounds(): UseOpenRoundsResult {
  const [rounds, setRounds] = useState<OpenRound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const config = createConfig();
        const server = new rpc.Server(config.rpcUrl, {
          allowHttp: config.rpcUrl.startsWith('http://'),
        });

        // 1. Find round IDs from RoundCreated events.
        const { sequence } = await server.getLatestLedger();
        const response = await server.getEvents({
          startLedger: Math.max(1, sequence - LOOKBACK_LEDGERS),
          filters: [
            {
              type: 'contract',
              contractIds: [config.lyricsflipContractId],
              topics: [
                [nativeToScVal(TOPIC_ROUND_CREATED, { type: 'symbol' }).toXDR('base64'), '*'],
              ],
            },
          ],
        });

        if (cancelled) return;

        // Deduplicate round IDs.
        const roundIds = Array.from(
          new Set(
            response.events
              .map((e) => {
                try {
                  const [, roundIdVal] = e.topic.map((t) => scValToNative(t));
                  return typeof roundIdVal === 'bigint' ? roundIdVal : null;
                } catch {
                  return null;
                }
              })
              .filter((id): id is bigint => id !== null),
          ),
        );

        if (roundIds.length === 0) {
          if (!cancelled) {
            setRounds([]);
            setIsLoading(false);
          }
          return;
        }

        // 2. Fetch each round via simulate (read-only).
        const { contract } = await import('@stellar/stellar-sdk');
        const client = await contract.Client.from({
          contractId: config.lyricsflipContractId,
          networkPassphrase: config.networkPassphrase,
          rpcUrl: config.rpcUrl,
        });

        const nowSec = Math.floor(Date.now() / 1000);
        const settled = await Promise.allSettled(
          roundIds.map(async (id) => {
            const assembled = await (client as any).get_round({ round_id: id });
            const raw = assembled.result;
            const round: Round = { ...raw, genre: genreFromWire(raw.genre) };
            return round;
          }),
        );

        if (cancelled) return;

        const open: OpenRound[] = [];
        for (const result of settled) {
          if (result.status !== 'fulfilled') continue;
          const round = result.value;
          if (round.is_cancelled || round.is_completed || round.is_started)
            continue;
          const sLeft = secondsLeft(round.end_time);
          if (sLeft === 0) continue; // expired
          // Fetch player count
          let playerCount = 0;
          try {
            const pc = await (client as any).get_round_players({
              round_id: round.round_id,
            });
            playerCount = (pc.result as string[]).length;
          } catch {
            // non-fatal
          }
          open.push({ round, secondsLeft: sLeft, playerCount });
        }

        if (!cancelled) {
          // Sort most-recently-created first (highest round_id first).
          open.sort((a, b) =>
            a.round.round_id > b.round.round_id ? -1 : 1,
          );
          setRounds(open);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load open rounds',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();
    const timer = setInterval(run, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [tick]);

  return { rounds, isLoading, error, refresh };
}
