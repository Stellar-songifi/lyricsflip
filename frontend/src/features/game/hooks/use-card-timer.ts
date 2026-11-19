// src/features/game/hooks/use-card-timer.ts
//
// Card countdown driven by the round's snapshotted `answer_window` (LF-307).
// The countdown starts at the ledger-close time of the draw transaction
// (`closedAtMs`) minus `FIRST_LEDGER_GRACE_SECONDS` of grace, so the UI agrees
// with the contract's correctness cut-off for any configured window.
import { useEffect, useState } from 'react';
import {
  CARD_ANSWER_WINDOW_SECONDS,
  FIRST_LEDGER_GRACE_SECONDS,
  MAX_CORRECT_POINTS,
  MIN_CORRECT_POINTS,
  POINTS_DECAY_PER_SECOND,
} from '@/lib/stellar/types';

interface UseCardTimerParams {
  /** The round's snapshotted answer window, in seconds. */
  answerWindowSeconds: number;
  /** Ledger-close timestamp (ms epoch) of the draw transaction. */
  closedAtMs?: number;
}

export const useCardTimer = ({
  answerWindowSeconds,
  closedAtMs,
}: UseCardTimerParams) => {
  const [timeLeft, setTimeLeft] = useState(() =>
    Math.max(0, answerWindowSeconds - FIRST_LEDGER_GRACE_SECONDS),
  );
  const [startMs, setStartMs] = useState<number | undefined>(undefined);

  useEffect(() => {
    // (Re)start the countdown when a new card is drawn (closedAtMs changes).
    if (closedAtMs !== undefined) {
      setStartMs(closedAtMs);
      const elapsed = Math.max(0, (Date.now() - closedAtMs) / 1000);
      setTimeLeft(
        Math.max(0, answerWindowSeconds - elapsed - FIRST_LEDGER_GRACE_SECONDS),
      );
    }
  }, [closedAtMs, answerWindowSeconds]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  const baseMs = startMs ?? Date.now();
  const elapsedSeconds = Math.max(0, (Date.now() - baseMs) / 1000);

  // Points decay indicator (MAX − 5/s), clamped to the contract's floor.
  const points = Math.max(
    MIN_CORRECT_POINTS,
    Math.min(
      MAX_CORRECT_POINTS,
      MAX_CORRECT_POINTS - Math.floor(elapsedSeconds * POINTS_DECAY_PER_SECOND),
    ),
  );

  return { timeLeft, points };
};

/** Fallback window when the round hasn't reported `answer_window` yet. */
export const DEFAULT_CARD_TIMER_WINDOW_SECONDS = CARD_ANSWER_WINDOW_SECONDS;
