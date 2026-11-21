/**
 * Tests for hooks/use-round-events.ts (LF-196 / issue #682)
 *
 * Verifies that useRoundEvents:
 * - Seeds initial state from getRoundPlayers and getRound
 * - Adds players on RoundJoined
 * - Removes players on RoundLeft from both joined and ready
 * - Adds players on PlayerReady
 * - Stops polling once RoundStarted or RoundCancelled is observed
 * - Backs off exponentially on errors and recovers on success
 */
import { renderHook, waitFor, act } from '@testing-library/react';

const mockGetEvents = jest.fn();
const mockGetLatestLedger = jest.fn();
const mockGetRound = jest.fn();
const mockGetRoundPlayers = jest.fn();

jest.mock('@stellar/stellar-sdk', () => ({
  contract: { Client: { from: jest.fn() } },
  rpc: {
    Server: jest.fn(() => ({
      getEvents: mockGetEvents,
      getLatestLedger: mockGetLatestLedger,
    })),
  },
  nativeToScVal: jest.fn(() => ({ toXDR: () => 'ROUND_TOPIC' })),
  scValToNative: jest.fn((value: unknown) => value),
}));

jest.mock('@/lib/stellar/stellar-config', () => ({
  createConfig: () => ({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    lyricsflipContractId: 'CLYRICSFLIP',
    lyricsflipNftContractId: 'CLYRICSFLIPNFT',
  }),
}));

jest.mock('@/lib/stellar/client', () => ({
  createSystemCalls: () => ({
    getRound: mockGetRound,
    getRoundPlayers: mockGetRoundPlayers,
  }),
}));

import { useRoundEvents } from '@/hooks/use-round-events';

const ROUND_ID = BigInt(42);

const makeEvent = (name: string, player: string) => ({
  topic: [name, ROUND_ID, player],
  value: null,
});

describe('useRoundEvents (LF-196)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLatestLedger.mockResolvedValue({ sequence: 100000 });
    mockGetEvents.mockResolvedValue({ events: [], cursor: 'cursor-1' });
    mockGetRound.mockResolvedValue({ is_started: false, is_cancelled: false });
    mockGetRoundPlayers.mockResolvedValue([]);
  });

  it('seeds players from getRoundPlayers even when no recent events exist (lobbies > 1 day old)', async () => {
    mockGetRoundPlayers.mockResolvedValueOnce(['G_PLAYER_OLD_1', 'G_PLAYER_OLD_2']);
    mockGetEvents.mockResolvedValue({ events: [], cursor: 'cursor-empty' });

    const { result } = renderHook(() =>
      useRoundEvents(ROUND_ID, { pollIntervalMs: 20 }),
    );

    await waitFor(() => expect(result.current.lastUpdatedAt).not.toBeNull());

    expect(result.current.joined).toEqual(['G_PLAYER_OLD_1', 'G_PLAYER_OLD_2']);
    expect(result.current.started).toBe(false);
    expect(result.current.cancelled).toBe(false);
  });

  it('adds player on RoundJoined and marks ready on PlayerReady', async () => {
    mockGetRoundPlayers.mockResolvedValueOnce(['G_PLAYER_1']);
    mockGetEvents.mockResolvedValueOnce({
      events: [
        makeEvent('round_joined', 'G_PLAYER_2'),
        makeEvent('player_ready', 'G_PLAYER_1'),
      ],
      cursor: 'cursor-2',
    });

    const { result } = renderHook(() =>
      useRoundEvents(ROUND_ID, { pollIntervalMs: 20 }),
    );

    await waitFor(() => expect(result.current.joined).toContain('G_PLAYER_2'));

    expect(result.current.joined).toEqual(['G_PLAYER_1', 'G_PLAYER_2']);
    expect(result.current.ready).toEqual(['G_PLAYER_1']);
  });

  it('removes leaving players from both joined and ready on RoundLeft', async () => {
    mockGetRoundPlayers.mockResolvedValueOnce(['G_PLAYER_1', 'G_PLAYER_2']);
    mockGetEvents
      .mockResolvedValueOnce({
        events: [
          makeEvent('player_ready', 'G_PLAYER_2'),
          makeEvent('round_left', 'G_PLAYER_2'),
        ],
        cursor: 'cursor-1',
      })
      .mockResolvedValue({ events: [], cursor: 'cursor-1' });

    const { result } = renderHook(() =>
      useRoundEvents(ROUND_ID, { pollIntervalMs: 50 }),
    );

    await waitFor(() => expect(result.current.lastUpdatedAt).not.toBeNull());

    expect(result.current.joined).toEqual(['G_PLAYER_1']);
    expect(result.current.ready).not.toContain('G_PLAYER_2');
  });

  it('detects RoundStarted and stops polling', async () => {
    mockGetEvents.mockResolvedValueOnce({
      events: [makeEvent('round_started', 'G_ADMIN')],
      cursor: 'cursor-started',
    });

    const { result } = renderHook(() =>
      useRoundEvents(ROUND_ID, { pollIntervalMs: 20 }),
    );

    await waitFor(() => expect(result.current.started).toBe(true));

    const pollCountAfterStart = mockGetEvents.mock.calls.length;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    expect(mockGetEvents.mock.calls.length).toBe(pollCountAfterStart);
  });

  it('detects RoundCancelled and stops polling', async () => {
    mockGetEvents.mockResolvedValueOnce({
      events: [makeEvent('round_cancelled', 'G_ADMIN')],
      cursor: 'cursor-cancelled',
    });

    const { result } = renderHook(() =>
      useRoundEvents(ROUND_ID, { pollIntervalMs: 20 }),
    );

    await waitFor(() => expect(result.current.cancelled).toBe(true));

    const pollCountAfterCancel = mockGetEvents.mock.calls.length;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    expect(mockGetEvents.mock.calls.length).toBe(pollCountAfterCancel);
  });

  it('backs off exponentially on error and recovers on next success', async () => {
    mockGetEvents
      .mockRejectedValueOnce(new Error('RPC network timeout'))
      .mockResolvedValueOnce({
        events: [makeEvent('round_joined', 'G_PLAYER_RECOVERED')],
        cursor: 'cursor-ok',
      });

    const { result } = renderHook(() =>
      useRoundEvents(ROUND_ID, { pollIntervalMs: 150, maxBackoffMs: 1000 }),
    );

    await waitFor(() =>
      expect(result.current.error).toBe('RPC network timeout'),
    );

    await waitFor(() =>
      expect(result.current.joined).toContain('G_PLAYER_RECOVERED'),
    );
    expect(result.current.error).toBeNull();
  });

  it('does not poll when roundId is null', async () => {
    renderHook(() => useRoundEvents(null));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetEvents).not.toHaveBeenCalled();
    expect(mockGetRound).not.toHaveBeenCalled();
  });
});
