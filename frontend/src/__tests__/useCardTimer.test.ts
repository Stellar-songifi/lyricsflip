/**
 * Unit tests for useCardTimer
 *
 * Covers Issue #472 / LF-055 acceptance criteria:
 *   "Unit test for the timer hook uses fake timers."
 *
 * We use Jest fake timers so every second of the 15-second countdown
 * can be fast-forwarded instantly.
 */

import { renderHook, act } from '@testing-library/react';
import {
  useCardTimer,
  CARD_TIMEOUT_SECONDS,
  CARD_LEDGER_LATENCY_SECONDS,
} from '@/features/game/hooks/use-card-timer';

describe('use-card-timer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    // Clear pending timers without triggering state updates outside act()
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('starts at CARD_TIMEOUT_SECONDS when isActive is true', () => {
    const onTimeout = jest.fn();
    const { result } = renderHook(() =>
      useCardTimer({ isActive: true, onTimeout }),
    );

    expect(result.current.timeLeft).toBe(CARD_TIMEOUT_SECONDS);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('counts down one second at a time', () => {
    const onTimeout = jest.fn();
    const { result } = renderHook(() =>
      useCardTimer({ isActive: true, onTimeout }),
    );

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.timeLeft).toBe(CARD_TIMEOUT_SECONDS - 1);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.timeLeft).toBe(CARD_TIMEOUT_SECONDS - 2);
  });

  it('calls onTimeout exactly once when the timer reaches zero', () => {
    const onTimeout = jest.fn();
    renderHook(() => useCardTimer({ isActive: true, onTimeout }));

    act(() => {
      // Advance the full 15 seconds
      jest.advanceTimersByTime(CARD_TIMEOUT_SECONDS * 1000);
    });

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does NOT tick when isActive is false', () => {
    const onTimeout = jest.fn();
    const { result } = renderHook(() =>
      useCardTimer({ isActive: false, onTimeout }),
    );

    act(() => {
      jest.advanceTimersByTime(CARD_TIMEOUT_SECONDS * 1000);
    });

    expect(result.current.timeLeft).toBe(CARD_TIMEOUT_SECONDS);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('stops ticking after isActive switches to false mid-countdown', () => {
    const onTimeout = jest.fn();
    let isActive = true;
    const { result, rerender } = renderHook(() =>
      useCardTimer({ isActive, onTimeout }),
    );

    // Tick 5 seconds
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.timeLeft).toBe(CARD_TIMEOUT_SECONDS - 5);

    // Deactivate the timer
    isActive = false;
    rerender();

    // Advance another 15 seconds – timer should not reach zero
    act(() => {
      jest.advanceTimersByTime(CARD_TIMEOUT_SECONDS * 1000);
    });

    expect(onTimeout).not.toHaveBeenCalled();
    // timeLeft freezes at the value it had when deactivated
    expect(result.current.timeLeft).toBe(CARD_TIMEOUT_SECONDS - 5);
  });

  it('resets timeLeft to CARD_TIMEOUT_SECONDS when reset() is called', () => {
    const onTimeout = jest.fn();
    const { result } = renderHook(() =>
      useCardTimer({ isActive: true, onTimeout }),
    );

    act(() => {
      jest.advanceTimersByTime(8000); // 8 seconds in
    });
    expect(result.current.timeLeft).toBe(CARD_TIMEOUT_SECONDS - 8);

    act(() => {
      result.current.reset();
    });
    expect(result.current.timeLeft).toBe(CARD_TIMEOUT_SECONDS);
  });

  it('does not call onTimeout again after reset when isActive is true', () => {
    const onTimeout = jest.fn();
    const { result } = renderHook(() =>
      useCardTimer({ isActive: true, onTimeout }),
    );

    // Run out the first card
    act(() => {
      jest.advanceTimersByTime(CARD_TIMEOUT_SECONDS * 1000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);

    // Reset for a new card
    act(() => {
      result.current.reset();
    });

    // Confirm a fresh countdown runs without immediately firing onTimeout again
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1); // still only once

    // Complete the second countdown
    act(() => {
      jest.advanceTimersByTime((CARD_TIMEOUT_SECONDS - 5) * 1000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Ledger-anchored countdown (LF-193 / issue #679)
//
// The card window starts when the `next_card` transaction is included in a
// ledger, so the countdown must be derived from that close time and must close
// one ledger early to avoid accepting clicks the contract will score late.
// ---------------------------------------------------------------------------
describe('use-card-timer – ledger-anchored', () => {
  const NOW = new Date('2026-01-01T00:00:00.000Z').getTime();

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const renderAnchored = (
    startedAtMs: number,
    isActive = true,
    onTimeout = jest.fn(),
  ) =>
    renderHook(() =>
      useCardTimer({ isActive, onTimeout, startedAtMs }),
    );

  it('derives the remaining time from the ledger close time', () => {
    jest.setSystemTime(NOW);
    const { result } = renderAnchored(NOW - 3000);

    // 15 s window − 5 s ledger allowance − 3 s already elapsed.
    expect(result.current.timeLeft).toBe(7);
    expect(result.current.isExpired).toBe(false);
  });

  it('closes the window one ledger before the contract deadline', () => {
    jest.setSystemTime(NOW);
    const { result } = renderAnchored(
      NOW - (CARD_TIMEOUT_SECONDS - CARD_LEDGER_LATENCY_SECONDS) * 1000,
    );

    expect(result.current.timeLeft).toBe(0);
    expect(result.current.isExpired).toBe(true);
  });

  it('calls onTimeout once and stops ticking when the anchored window closes', () => {
    jest.setSystemTime(NOW);
    const onTimeout = jest.fn();
    const { result } = renderAnchored(NOW, true, onTimeout);

    expect(result.current.timeLeft).toBe(CARD_TIMEOUT_SECONDS - CARD_LEDGER_LATENCY_SECONDS);

    act(() => {
      jest.advanceTimersByTime((CARD_TIMEOUT_SECONDS - CARD_LEDGER_LATENCY_SECONDS) * 1000);
    });

    expect(result.current.timeLeft).toBe(0);
    expect(onTimeout).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(CARD_TIMEOUT_SECONDS * 1000);
    });

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('clears its interval on unmount', () => {
    jest.setSystemTime(NOW);
    const { unmount } = renderAnchored(NOW);

    expect(jest.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(jest.getTimerCount()).toBe(0);
  });
});
