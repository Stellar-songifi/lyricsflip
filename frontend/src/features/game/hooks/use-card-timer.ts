/**
 * useCardTimer
 *
 * Per-card 15-second countdown for Issue #472 (LF-055), synced with the
 * contract's answer window for Issue #679 (LF-193).
 *
 * The contract opens the window when the `next_card` transaction is included
 * in a ledger (`CARD_ANSWER_WINDOW_SECONDS`, 15 s) and scores anything that
 * lands after it as wrong. A countdown that starts at render time therefore
 * keeps accepting clicks after the contract window has closed.
 *
 * When the caller supplies `startedAtMs` (the ledger close time of the
 * `next_card` transaction) the countdown is derived from that absolute
 * timestamp, minus one ledger of submission latency, so the UI closes early
 * rather than accepting an answer the contract will reject. Without an anchor
 * the hook keeps its original local countdown.
 *
 * - Start the timer whenever a new card is displayed.
 * - On timeout, call `onTimeout()` so the parent can flip the card and
 *   count the card as a miss.
 * - Stop the timer (and reset it) when `isActive` becomes false (e.g.
 *   the player answered or the component unmounts).
 *
 * The timer does NOT tick if the user prefers reduced motion; callers
 * should still respect that signal for the flip animation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export const CARD_TIMEOUT_SECONDS = 15;

/**
 * Roughly one ledger of latency (~5 s on Stellar). The visible countdown
 * stops this much before the contract deadline so a click sent at the last
 * moment still has a chance of being included in time.
 */
export const CARD_LEDGER_LATENCY_SECONDS = 5;

export interface UseCardTimerOptions {
  /** Called exactly once when the countdown reaches zero. */
  onTimeout: () => void;
  /**
   * Set to `true` while a card is waiting for an answer.
   * Setting it to `false` (e.g. after answer or before new card) pauses
   * and resets the timer.
   */
  isActive: boolean;
  /**
   * Ledger close time (unix ms) of the `next_card` transaction. When set, the
   * remaining time is derived from this absolute anchor instead of from the
   * moment the hook mounted.
   */
  startedAtMs?: number | null;
  /** Seconds subtracted from the visible countdown (defaults to one ledger). */
  latencyAllowanceSeconds?: number;
}

export interface UseCardTimerResult {
  /** Remaining seconds (starts at CARD_TIMEOUT_SECONDS, counts down to 0). */
  timeLeft: number;
  /** True once the visible countdown hit zero — input must be closed. */
  isExpired: boolean;
  /**
   * Reset the timer to CARD_TIMEOUT_SECONDS without starting it.
   * Call this before setting `isActive = true` for the next card.
   */
  reset: () => void;
}

const secondsUntil = (deadlineMs: number) =>
  Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));

export function useCardTimer({
  onTimeout,
  isActive,
  startedAtMs = null,
  latencyAllowanceSeconds = CARD_LEDGER_LATENCY_SECONDS,
}: UseCardTimerOptions): UseCardTimerResult {
  const [timeLeft, setTimeLeft] = useState(CARD_TIMEOUT_SECONDS);
  const onTimeoutRef = useRef(onTimeout);
  const firedRef = useRef(false);

  // Keep callback ref stable so callers don't need to memoize it
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  // Absolute deadline for this card: ledger close time + window − latency.
  const deadlineMs =
    startedAtMs === null || startedAtMs === undefined
      ? null
      : startedAtMs + (CARD_TIMEOUT_SECONDS - latencyAllowanceSeconds) * 1000;

  const fireTimeout = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onTimeoutRef.current();
  }, []);

  // Ledger-anchored countdown: a single interval that recomputes the
  // remaining seconds from the contract deadline. It is created once per
  // card and cleared on unmount.
  useEffect(() => {
    if (deadlineMs === null || !isActive || firedRef.current) return;

    const update = () => {
      const remaining = secondsUntil(deadlineMs);
      setTimeLeft(remaining);
      return remaining;
    };

    if (update() <= 0) {
      fireTimeout();
      return;
    }

    const id = setInterval(() => {
      if (update() <= 0) {
        clearInterval(id);
        fireTimeout();
      }
    }, 1000);

    return () => clearInterval(id);
  }, [deadlineMs, isActive, fireTimeout]);

  // Legacy local countdown (no ledger anchor supplied).
  useEffect(() => {
    if (deadlineMs !== null || !isActive || firedRef.current) return;

    if (timeLeft <= 0) {
      fireTimeout();
      return;
    }

    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          fireTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [deadlineMs, isActive, timeLeft, fireTimeout]);

  const reset = useCallback(() => {
    firedRef.current = false;
    setTimeLeft(CARD_TIMEOUT_SECONDS);
  }, []);

  return { timeLeft, isExpired: timeLeft <= 0, reset };
}
