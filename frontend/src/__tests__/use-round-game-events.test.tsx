/**
 * Tests for hooks/use-round-game-events.ts (LF-195 / issue #681)
 *
 * The multiplayer scoreboard is built from `AnswerSubmitted` events and the
 * final winners/scores from `RoundCompleted`, polled through the cursor-based
 * `getEvents` stream.
 */
import { renderHook, waitFor, act } from '@testing-library/react';

const mockGetEvents = jest.fn();
const mockGetLatestLedger = jest.fn();

jest.mock('@stellar/stellar-sdk', () => ({
  contract: { Client: { from: jest.fn() } },
  rpc: {
    Server: jest.fn(() => ({
      getEvents: mockGetEvents,
      getLatestLedger: mockGetLatestLedger,
    })),
  },
  nativeToScVal: jest.fn(() => ({ toXDR: () => 'TOPIC' })),
  scValToNative: jest.fn((value: unknown) => value),
}));

jest.mock('@/lib/stellar/stellar-config', () => ({
  createConfig: () => ({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    lyricsflipContractId: 'CTEST',
    lyricsflipNftContractId: 'CTESTNFT',
  }),
}));

// Imported after the module mocks so the hook picks them up.
import { useRoundGameEvents } from '@/hooks/use-round-game-events';

const ROUND_ID = BigInt(7);

const answerSubmitted = (player: string, points: number) => ({
  topic: ['answer_submitted', ROUND_ID, player],
  value: { correct: points > 0, points: BigInt(points) },
});

const roundCompleted = (winners: string[], scores: Map<string, number>) => ({
  topic: ['round_completed', ROUND_ID],
  value: { winners, scores },
});

describe('useRoundGameEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLatestLedger.mockResolvedValue({ sequence: 1000 });
    mockGetEvents.mockResolvedValue({ events: [], cursor: 'cursor-end' });
  });

  it('sums points and cards answered per player from AnswerSubmitted', async () => {
    mockGetEvents.mockResolvedValueOnce({
      events: [answerSubmitted('GPLAYER1', 100), answerSubmitted('GPLAYER2', 0)],
      cursor: 'cursor-1',
    });

    const { result } = renderHook(() =>
      useRoundGameEvents(ROUND_ID, 20),
    );

    await waitFor(() => expect(result.current.lastUpdatedAt).not.toBeNull());

    expect(result.current.scores).toEqual({ GPLAYER1: 100, GPLAYER2: 0 });
    expect(result.current.answered).toEqual({ GPLAYER1: 1, GPLAYER2: 1 });
    expect(result.current.completed).toBe(false);
  });

  it('accumulates answers that arrive on later polls', async () => {
    mockGetEvents
      .mockResolvedValueOnce({
        events: [answerSubmitted('GPLAYER1', 100)],
        cursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        events: [answerSubmitted('GPLAYER1', 60)],
        cursor: 'cursor-2',
      })
      .mockResolvedValue({ events: [], cursor: 'cursor-2' });

    const { result } = renderHook(() =>
      useRoundGameEvents(ROUND_ID, 20),
    );

    await waitFor(() =>
      expect(result.current.scores.GPLAYER1).toBe(160),
    );
    expect(result.current.answered.GPLAYER1).toBe(2);
  });

  it('reads winners and final scores from RoundCompleted', async () => {
    mockGetEvents.mockResolvedValueOnce({
      events: [
        answerSubmitted('GPLAYER1', 120),
        roundCompleted(['GPLAYER1'], new Map([['GPLAYER1', 120]])),
      ],
      cursor: 'cursor-1',
    });

    const { result } = renderHook(() =>
      useRoundGameEvents(ROUND_ID, 20),
    );

    await waitFor(() => expect(result.current.completed).toBe(true));

    expect(result.current.winners).toEqual(['GPLAYER1']);
    expect(result.current.finalScores).toEqual({ GPLAYER1: 120 });
  });

  it('keeps polling until unmounted, then clears its interval', async () => {
    const clearSpy = jest.spyOn(global, 'clearInterval');
    const { result, unmount } = renderHook(() =>
      useRoundGameEvents(ROUND_ID, 20),
    );

    await waitFor(() => expect(result.current.lastUpdatedAt).not.toBeNull());
    clearSpy.mockClear();

    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('does not poll when there is no round', async () => {
    renderHook(() => useRoundGameEvents(null));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetEvents).not.toHaveBeenCalled();
  });
});
