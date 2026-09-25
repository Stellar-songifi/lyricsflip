/**
 * useCardTimer
 *
 * Per-card 15-second countdown for Issue #472 (LF-055).
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

export interface UseCardTimerOptions {
  /** Called exactly once when the countdown reaches zero. */
  onTimeout: () => void;
  /**
   * Set to `true` while a card is waiting for an answer.
   * Setting it to `false` (e.g. after answer or before new card) pauses
   * and resets the timer.
   */
  isActive: boolean;
}

export interface UseCardTimerResult {
  /** Remaining seconds (starts at CARD_TIMEOUT_SECONDS, counts down to 0). */
  timeLeft: number;
  /**
   * Reset the timer to CARD_TIMEOUT_SECONDS without starting it.
   * Call this before setting `isActive = true` for the next card.
   */
  reset: () => void;
}

export function useCardTimer({
  onTimeout,
  isActive,
}: UseCardTimerOptions): UseCardTimerResult {
  const [timeLeft, setTimeLeft] = useState(CARD_TIMEOUT_SECONDS);
  const onTimeoutRef = useRef(onTimeout);

  // Keep callback ref stable so callers don't need to memoize it
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    if (!isActive) {
      // Don't tick while inactive
      return;
    }

    if (timeLeft <= 0) {
      // Fire the callback once when we hit zero
      onTimeoutRef.current();
      return;
    }

    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, timeLeft]);

  const reset = useCallback(() => {
    setTimeLeft(CARD_TIMEOUT_SECONDS);
  }, []);

  return { timeLeft, reset };
}
