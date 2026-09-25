/**
 * Unit tests for useLeaderboard (Issue #471 / LF-054)
 *
 * Acceptance criteria: "A hook test uses a mocked API."
 *
 * We mock `@/services/api` so the tests never hit the network,
 * and wrap the hook with the TanStack Query provider.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useLeaderboard } from '@/hooks/useLeaderboard';

// ── Mock services/api ──────────────────────────────────────────────────────

jest.mock('@/services/api', () => ({
  get: jest.fn(),
}));

import { get } from '@/services/api';
const mockedGet = get as jest.MockedFunction<typeof get>;

// ── Helper ─────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Disable retries so failed requests surface immediately in tests
        retry: false,
        // Disable gc so we can inspect data after query resolves
        gcTime: Infinity,
      },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// ── Sample data ────────────────────────────────────────────────────────────

const MOCK_ENTRIES = [
  {
    rank: 1,
    address: 'GABCDEF1',
    username: 'alice',
    roundsWon: 42,
    maxStreak: 7,
    totalRounds: 60,
  },
  {
    rank: 2,
    address: 'GABCDEF2',
    username: null,
    roundsWon: 35,
    maxStreak: 5,
    totalRounds: 50,
  },
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useLeaderboard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns normalised leaderboard entries for a paginated response', async () => {
    mockedGet.mockResolvedValueOnce({
      data: MOCK_ENTRIES,
      total: 2,
      page: 1,
      limit: 20,
    });

    const { result } = renderHook(() => useLeaderboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.entries).toHaveLength(2);
    expect(result.current.data?.entries[0]).toMatchObject({
      rank: 1,
      address: 'GABCDEF1',
      username: 'alice',
      rounds_won: 42,
      max_streak: 7,
      total_rounds: 60,
    });
    expect(result.current.data?.entries[1].username).toBeNull();
  });

  it('handles a bare array response (no pagination wrapper)', async () => {
    mockedGet.mockResolvedValueOnce(MOCK_ENTRIES);

    const { result } = renderHook(() => useLeaderboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.entries).toHaveLength(2);
    expect(result.current.data?.totalPages).toBe(1);
  });

  it('passes the correct query-string params to the API', async () => {
    mockedGet.mockResolvedValueOnce({ data: [], total: 0, page: 2, limit: 10 });

    const { result } = renderHook(
      () => useLeaderboard({ filter: 'weekly', page: 2, limit: 10 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedGet).toHaveBeenCalledWith(
      '/leaderboard?filter=weekly&page=2&limit=10',
    );
  });

  it('passes genre filter to the API', async () => {
    mockedGet.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });

    const { result } = renderHook(
      () => useLeaderboard({ filter: 'HipHop' }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedGet).toHaveBeenCalledWith(
      '/leaderboard?filter=HipHop&page=1&limit=20',
    );
  });

  it('exposes isError and the error message when the API fails', async () => {
    mockedGet.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useLeaderboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Network error');
  });

  it('returns an empty entries array when data.data is empty', async () => {
    mockedGet.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });

    const { result } = renderHook(() => useLeaderboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.entries).toEqual([]);
    expect(result.current.data?.total).toBe(0);
  });

  it('auto-assigns rank from array index when rank is missing', async () => {
    const rawWithoutRank = MOCK_ENTRIES.map(({ rank: _rank, ...rest }) => rest);
    mockedGet.mockResolvedValueOnce(rawWithoutRank);

    const { result } = renderHook(() => useLeaderboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.entries[0].rank).toBe(1);
    expect(result.current.data?.entries[1].rank).toBe(2);
  });
});
