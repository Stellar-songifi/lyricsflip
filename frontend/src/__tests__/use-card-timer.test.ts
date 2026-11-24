// frontend/src/__tests__/use-card-timer.test.ts
//
// Unit tests for the card timer (LF-307): the countdown is driven by the
// round's snapshotted `answer_window` and starts at the ledger-close time of
// the draw transaction, minus FIRST_LEDGER_GRACE_SECONDS of grace.
import { act, renderHook } from '@testing-library/react';
import {
  FIRST_LEDGER_GRACE_SECONDS,
  MAX_CORRECT_POINTS,
  MIN_CORRECT_POINTS,
} from '@/lib/stellar/types';
import { useCardTimer } from '@/features/game/hooks/use-card-timer';

describe('useCardTimer (LF-307)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderTimer = (params: Parameters<typeof useCardTimer>[0]) =>
    renderHook((props: Parameters<typeof useCardTimer>[0]) => useCardTimer(props), {
      initialProps: params,
    });

  it('counts down from the 5 s window', () => {
    const { result } = renderTimer({ answerWindowSeconds: 5 });
    expect(result.current.timeLeft).toBe(5 - FIRST_LEDGER_GRACE_SECONDS);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.timeLeft).toBe(3 - FIRST_LEDGER_GRACE_SECONDS);
  });

  it('agrees with the contract cut-off for a 15 s window', () => {
    const closedAtMs = Date.now();
    const { result } = renderTimer({ answerWindowSeconds: 15, closedAtMs });
    expect(result.current.timeLeft).toBe(15 - FIRST_LEDGER_GRACE_SECONDS);
  });

  it('starts near zero for a 60 s window when the draw closed 50 s ago', () => {
    const { result } = renderTimer({
      answerWindowSeconds: 60,
      closedAtMs: Date.now() - 50_000,
    });
    expect(result.current.timeLeft).toBe(60 - 50 - FIRST_LEDGER_GRACE_SECONDS);
  });

  it('floors timeLeft at zero past the window', () => {
    const { result } = renderTimer({ answerWindowSeconds: 5 });
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(result.current.timeLeft).toBe(0);
  });

  it('shows the points decay (MAX_CORRECT_POINTS − 5/s)', () => {
    const closedAtMs = Date.now();
    const { result } = renderTimer({ answerWindowSeconds: 15, closedAtMs });
    expect(result.current.points).toBe(MAX_CORRECT_POINTS);
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(result.current.points).toBe(MAX_CORRECT_POINTS - 5 * 10);
    act(() => {
      jest.advanceTimersByTime(20_000);
    });
    expect(result.current.points).toBe(MIN_CORRECT_POINTS);
  });
});
