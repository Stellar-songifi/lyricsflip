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
import { useCardTimer, CARD_TIMEOUT_SECONDS } from '@/features/game/hooks/useCardTimer';

describe('useCardTimer', () => {
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
