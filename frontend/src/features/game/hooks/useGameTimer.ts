// src/features/game/hooks/useGameTimer.ts
import { useEffect, useRef } from 'react';
import { useStore } from '@/store';

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

export const useGameTimer = (): UseGameTimerReturn => {
  const {
    timeLeft,
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

  return {
    timeLeft,
    isTimerRunning,
    startGame,
    isPlaying,
    endGame,
    startTimer,
    stopTimer,
    resetTimer,
  };
};
