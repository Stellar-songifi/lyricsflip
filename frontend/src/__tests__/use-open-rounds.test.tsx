/**
 * Tests for hooks/use-open-rounds.ts (LF-194 / issue #680)
 *
 * The lobby list is read from the contract (`get_open_rounds`) and enriched
 * with player counts, the max-players setting and the age taken from
 * `RoundCreated` events.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import type { SystemCalls } from '@/lib/stellar/client';
import type { Round } from '@/lib/stellar/types';

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
import { useOpenRounds } from '@/hooks/use-open-rounds';

const NOW_SECONDS = Math.floor(Date.now() / 1000);

const makeRound = (roundId: number, overrides: Partial<Round> = {}): Round => ({
  round_id: BigInt(roundId),
  admin: 'GADMIN',
  genre: 'Pop',
  wager_amount: BigInt(0),
  start_time: BigInt(0),
  is_started: false,
  is_completed: false,
  end_time: BigInt(0),
  next_card_index: 0,
  is_cancelled: false,
  ...overrides,
});

const makeSystemCalls = (overrides: Partial<SystemCalls> = {}): SystemCalls =>
  ({
    getOpenRounds: jest.fn().mockResolvedValue([BigInt(1)]),
    getMaxPlayers: jest.fn().mockResolvedValue(4),
    getRound: jest.fn().mockResolvedValue(makeRound(1)),
    getRoundPlayers: jest.fn().mockResolvedValue(['GONE']),
    ...overrides,
  }) as unknown as SystemCalls;

describe('useOpenRounds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLatestLedger.mockResolvedValue({ sequence: 1000 });
    mockGetEvents.mockResolvedValue({ events: [], cursor: 'cursor-1' });
  });

  it('enriches open round ids with player counts and max players', async () => {
    const systemCalls = makeSystemCalls();
    const { result } = renderHook(() => useOpenRounds({ systemCalls }));

    await waitFor(() => expect(result.current.rounds).toHaveLength(1));

    const [entry] = result.current.rounds;
    expect(entry.round.round_id).toBe(BigInt(1));
    expect(entry.playerCount).toBe(1);
    expect(entry.maxPlayers).toBe(4);
    expect(entry.isFull).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.lastUpdatedAt).not.toBeNull();
  });

  it('hides rounds that already started or were cancelled', async () => {
    const systemCalls = makeSystemCalls({
      getOpenRounds: jest.fn().mockResolvedValue([BigInt(1), BigInt(2), BigInt(3)]),
      getRound: jest
        .fn()
        .mockImplementation(async (id: bigint) =>
          id === BigInt(2)
            ? makeRound(2, { is_started: true })
            : id === BigInt(3)
              ? makeRound(3, { is_cancelled: true })
              : makeRound(1),
        ),
    });

    const { result } = renderHook(() => useOpenRounds({ systemCalls }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rounds.map((r) => r.round.round_id)).toEqual([BigInt(1)]);
  });

  it('hides full lobbies', async () => {
    const systemCalls = makeSystemCalls({
      getMaxPlayers: jest.fn().mockResolvedValue(2),
      getRoundPlayers: jest.fn().mockResolvedValue(['G1', 'G2']),
    });

    const { result } = renderHook(() => useOpenRounds({ systemCalls }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rounds).toHaveLength(0);
  });

  it('uses RoundCreated events for the age and hides stale lobbies', async () => {
    mockGetEvents.mockResolvedValue({
      events: [
        {
          topic: ['round_created', BigInt(1), 'GADMIN'],
          value: { created_time: BigInt(NOW_SECONDS) },
        },
        {
          topic: ['round_created', BigInt(2), 'GADMIN'],
          value: { created_time: BigInt(NOW_SECONDS - 31 * 60) },
        },
      ],
      cursor: 'cursor-2',
    });

    const systemCalls = makeSystemCalls({
      getOpenRounds: jest.fn().mockResolvedValue([BigInt(1), BigInt(2)]),
      getRound: jest.fn().mockImplementation(async (id: bigint) => makeRound(Number(id))),
    });

    const { result } = renderHook(() => useOpenRounds({ systemCalls }));

    await waitFor(() =>
      expect(result.current.rounds.map((r) => r.round.round_id)).toEqual([BigInt(1)]),
    );
    expect(result.current.rounds[0].createdAtSeconds).toBe(NOW_SECONDS);
  });

  it('picks up a newly created lobby on refresh', async () => {
    const getOpenRounds = jest
      .fn()
      .mockResolvedValueOnce([BigInt(1)])
      .mockResolvedValue([BigInt(1), BigInt(2)]);
    const systemCalls = makeSystemCalls({
      getOpenRounds,
      getRound: jest.fn().mockImplementation(async (id: bigint) => makeRound(Number(id))),
    });

    const { result } = renderHook(() => useOpenRounds({ systemCalls }));
    await waitFor(() => expect(result.current.rounds).toHaveLength(1));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.rounds).toHaveLength(2);
  });

  it('stops polling once unmounted', async () => {
    const clearSpy = jest.spyOn(global, 'clearInterval');
    const systemCalls = makeSystemCalls();
    const { unmount } = renderHook(() => useOpenRounds({ systemCalls }));

    await waitFor(() => expect(mockGetLatestLedger).toHaveBeenCalled());
    clearSpy.mockClear();
    unmount();

    // Unmount must clear both polling intervals (list + events).
    expect(clearSpy).toHaveBeenCalledTimes(2);
    clearSpy.mockRestore();
  });
});
