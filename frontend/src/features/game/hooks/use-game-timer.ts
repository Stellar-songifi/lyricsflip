import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store';

interface UseGameTimerOptions {
  /**
   * The round's on-chain end time (`Round.end_time`, unix seconds).
   *
   * When provided, the hook stops driving the store's counter and instead
   * derives the remaining time from `endTimeSeconds - now`, so a page refresh
   * (or any remount) resumes with the correct value and only one interval is
   * ever created. Passing `null`/`undefined` keeps the legacy store-driven
   * behaviour used by the other screens.
   */
  endTimeSeconds?: number | bigint | null;
}

interface UseGameTimerReturn {
  timeLeft: number;
  isTimerRunning: boolean;
  startGame: () => void;
  endGame: () => void;
  isPlaying: boolean;
  startTimer: () => void;
  stopTimer: () => void;
  resetTimer: (newTime?: number) => void;
}

const toDeadlineMs = (endTimeSeconds: number | bigint | null | undefined) => {
  if (endTimeSeconds === null || endTimeSeconds === undefined) return null;
  const seconds = Number(endTimeSeconds);
  if (!Number.isFinite(seconds)) return null;
  // `0` is a real (already elapsed) deadline: the contract leaves `end_time`
  // at 0 until the round starts.
  return seconds * 1000;
};

const remainingSeconds = (deadlineMs: number) =>
  Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));

export const useGameTimer = ({
  endTimeSeconds,
}: UseGameTimerOptions = {}): UseGameTimerReturn => {
  const {
    timeLeft: storeTimeLeft,
    isTimerRunning,
    isPlaying,
    startGame,
    endGame,
    startTimer,
    stopTimer,
    resetTimer,
    tickTimer,
  } = useStore((state) => state.game);

  // Keep a stable ref to tickTimer so the interval callback never goes stale.
  // Without this, every Zustand re-render creates a new tickTimer function
  // reference which would cause the effect to re-run and recreate the interval
  // on every tick.
  const tickTimerRef = useRef(tickTimer);
  useEffect(() => {
    tickTimerRef.current = tickTimer;
  });

  // Single interval per mount — only re-creates when the running state changes,
  // not on every tick. Clamps at 0 to prevent negative values on slow ticks.
  useEffect(() => {
    if (!isTimerRunning || !isPlaying) return;

    const intervalId = setInterval(() => {
      tickTimerRef.current();
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isTimerRunning, isPlaying]);

  const deadlineMs = toDeadlineMs(endTimeSeconds);
  const [deadlineTimeLeft, setDeadlineTimeLeft] = useState(() =>
    deadlineMs === null ? 0 : remainingSeconds(deadlineMs),
  );

  // Round-timer mode: a single interval recomputes the remaining seconds from
  // the contract's absolute deadline. The interval lives only while the
  // deadline is in the future and is torn down on unmount, so navigating away
  // (or refreshing) never leaks a timer or drifts from the contract clock.
  useEffect(() => {
    if (deadlineMs === null) return;

    const update = () => {
      const next = remainingSeconds(deadlineMs);
      setDeadlineTimeLeft(next);
      return next;
    };

    const initial = update();
    if (initial <= 0) return;

    const intervalId = setInterval(() => {
      if (update() <= 0) clearInterval(intervalId);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [deadlineMs]);

  return {
    timeLeft: deadlineMs === null ? storeTimeLeft : deadlineTimeLeft,
    isTimerRunning: deadlineMs === null ? isTimerRunning : deadlineTimeLeft > 0,
    startGame,
    isPlaying,
    endGame,
    startTimer,
    stopTimer,
    resetTimer,
  };
};
