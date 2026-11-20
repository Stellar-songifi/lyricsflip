/**
 * Tests for features/game/hooks/useGameTimer.ts  (issue #477 – LF-060)
 *
 * Uses Jest fake timers to verify:
 *  - timer counts down correctly via tickTimer
 *  - timer stops on unmount (no leak)
 *  - timer never goes below 0 (clamp)
 *  - resetting the timer works
 */
import { renderHook, act } from '@testing-library/react';
import { useGameTimer } from '@/features/game/hooks/use-game-timer';
import { useStore } from '@/store';

// Reset the Zustand store to a known state before each test
const resetGameStore = () => {
  useStore.setState((state) => {
    state.game.timeLeft = 15;
    state.game.isTimerRunning = false;
    state.game.isPlaying = false;
    state.game.gameStatus = 'idle';
    state.game.score = 0;
    state.game.currentRound = 0;
    state.game.lastGuessResult = null;
    state.game.lastPlayed = null;
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  resetGameStore();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('use-game-timer', () => {
  it('exposes timeLeft, startTimer, stopTimer, resetTimer', () => {
    const { result } = renderHook(() => useGameTimer());

    expect(typeof result.current.timeLeft).toBe('number');
    expect(typeof result.current.startTimer).toBe('function');
    expect(typeof result.current.stopTimer).toBe('function');
    expect(typeof result.current.resetTimer).toBe('function');
  });

  it('does not tick when isTimerRunning is false', () => {
    const { result } = renderHook(() => useGameTimer());

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(result.current.timeLeft).toBe(15); // unchanged
  });

  it('counts down when started', () => {
    const { result } = renderHook(() => useGameTimer());

    act(() => {
      result.current.startTimer();
    });

    act(() => {
      jest.advanceTimersByTime(3000); // 3 ticks
    });

    expect(result.current.timeLeft).toBe(12);
  });

  it('stops ticking after stopTimer is called', () => {
    const { result } = renderHook(() => useGameTimer());

    act(() => {
      result.current.startTimer();
    });

    act(() => {
      jest.advanceTimersByTime(2000); // 2 ticks → 13
    });

    act(() => {
      result.current.stopTimer();
    });

    act(() => {
      jest.advanceTimersByTime(5000); // would be 5 more ticks if running
    });

    expect(result.current.timeLeft).toBe(13);
  });

  it('never goes below 0 (clamp)', () => {
    // Set a short duration
    act(() => {
      useStore.getState().game.resetTimer(3);
    });

    const { result } = renderHook(() => useGameTimer());

    act(() => {
      result.current.startTimer();
    });

    // Advance well past the end
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(result.current.timeLeft).toBe(0);
    expect(result.current.timeLeft).toBeGreaterThanOrEqual(0);
  });

  it('stops the interval automatically when timeLeft reaches 0', () => {
    act(() => {
      useStore.getState().game.resetTimer(2);
    });

    const { result } = renderHook(() => useGameTimer());

    act(() => {
      result.current.startTimer();
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.timeLeft).toBe(0);
    expect(result.current.isTimerRunning).toBe(false);
    expect(result.current.isPlaying).toBe(false);
  });

  it('stops the timer when the component unmounts (no leak)', () => {
    const { result, unmount } = renderHook(() => useGameTimer());

    act(() => {
      result.current.startTimer();
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    const timeBeforeUnmount = result.current.timeLeft;

    unmount();

    // After unmount the interval should be cleared; the store's isTimerRunning
    // is still true (unmount only clears the interval, not the store state),
    // but no more ticks should fire through the hook.
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // The store's timeLeft would still be affected by ticks if a leak exists.
    // We verify here that timeLeft did not continue to decrease after unmount.
    const storeTimeLeft = useStore.getState().game.timeLeft;
    expect(storeTimeLeft).toBe(timeBeforeUnmount);
  });

  it('resetTimer changes timeLeft without starting the timer', () => {
    const { result } = renderHook(() => useGameTimer());

    act(() => {
      result.current.resetTimer(60);
    });

    expect(result.current.timeLeft).toBe(60);
    expect(result.current.isTimerRunning).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// tickTimer store action tests (unit-level, no hook)
// ---------------------------------------------------------------------------
describe('tickTimer store action', () => {
  it('decrements timeLeft by 1 when running', () => {
    useStore.setState((state) => {
      state.game.timeLeft = 10;
      state.game.isTimerRunning = true;
      state.game.isPlaying = true;
    });

    act(() => {
      useStore.getState().game.tickTimer();
    });

    expect(useStore.getState().game.timeLeft).toBe(9);
  });

  it('does not decrement when not running', () => {
    useStore.setState((state) => {
      state.game.timeLeft = 10;
      state.game.isTimerRunning = false;
    });

    act(() => {
      useStore.getState().game.tickTimer();
    });

    expect(useStore.getState().game.timeLeft).toBe(10);
  });

  it('clamps timeLeft to 0, never negative', () => {
    useStore.setState((state) => {
      state.game.timeLeft = 1;
      state.game.isTimerRunning = true;
      state.game.isPlaying = true;
    });

    // Tick twice — second tick should not take it below 0
    act(() => {
      useStore.getState().game.tickTimer();
      useStore.getState().game.tickTimer();
    });

    expect(useStore.getState().game.timeLeft).toBe(0);
    expect(useStore.getState().game.timeLeft).toBeGreaterThanOrEqual(0);
  });

  it('sets isTimerRunning=false and isPlaying=false when reaching 0', () => {
    useStore.setState((state) => {
      state.game.timeLeft = 1;
      state.game.isTimerRunning = true;
      state.game.isPlaying = true;
    });

    act(() => {
      useStore.getState().game.tickTimer();
    });

    const state = useStore.getState().game;
    expect(state.timeLeft).toBe(0);
    expect(state.isTimerRunning).toBe(false);
    expect(state.isPlaying).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Round-deadline mode (LF-192 / issue #678)
//
// The single-player round timer must be derived from the contract's absolute
// `end_time` so there is exactly one interval, it survives a refresh and it is
// always torn down on unmount.
// ---------------------------------------------------------------------------
describe('useGameTimer – round deadline mode', () => {
  const ONE_SECOND_MS = 1000;

  it('derives the remaining time from the deadline and counts down', () => {
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const endTimeSeconds = Math.floor(Date.now() / 1000) + 300;

    const { result } = renderHook(() =>
      useGameTimer({ endTimeSeconds: BigInt(endTimeSeconds) }),
    );

    expect(result.current.timeLeft).toBe(300);

    act(() => {
      jest.advanceTimersByTime(5 * ONE_SECOND_MS);
    });

    expect(result.current.timeLeft).toBe(295);
  });

  it('restores the correct remaining time after a remount (refresh)', () => {
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const endTimeSeconds = Math.floor(Date.now() / 1000) + 300;

    const first = renderHook(() =>
      useGameTimer({ endTimeSeconds: BigInt(endTimeSeconds) }),
    );

    act(() => {
      jest.advanceTimersByTime(40 * ONE_SECOND_MS);
    });
    expect(first.result.current.timeLeft).toBe(260);

    // Simulate a page refresh: the component unmounts and remounts while the
    // contract clock keeps running.
    first.unmount();

    const second = renderHook(() =>
      useGameTimer({ endTimeSeconds: BigInt(endTimeSeconds) }),
    );

    expect(second.result.current.timeLeft).toBe(260);
  });

  it('clamps at zero and stops the countdown once the deadline passes', () => {
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const endTimeSeconds = Math.floor(Date.now() / 1000) + 2;

    const { result } = renderHook(() =>
      useGameTimer({ endTimeSeconds: BigInt(endTimeSeconds) }),
    );

    act(() => {
      jest.advanceTimersByTime(10 * ONE_SECOND_MS);
    });

    expect(result.current.timeLeft).toBe(0);
    expect(result.current.isTimerRunning).toBe(false);
  });

  it('clears its interval on unmount and never leaks a timer', () => {
    const clearSpy = jest.spyOn(global, 'clearInterval');
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const endTimeSeconds = Math.floor(Date.now() / 1000) + 300;

    const { result, unmount } = renderHook(() =>
      useGameTimer({ endTimeSeconds: BigInt(endTimeSeconds) }),
    );

    expect(result.current.timeLeft).toBe(300);
    clearSpy.mockClear();

    unmount();

    expect(clearSpy).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);

    clearSpy.mockRestore();
  });
});
