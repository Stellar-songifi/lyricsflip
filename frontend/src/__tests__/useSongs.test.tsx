import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSongs } from '../hooks/use-songs';

const queryClient = new QueryClient();

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    {children}
  </QueryClientProvider>
);

describe('useSongs hook', () => {
  beforeEach(() => {
    // Mock the fetch function
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 1, title: 'Bohemian Rhapsody', artist: 'Queen', category: 'Rock', plays: 15000000 },
            { id: 2, title: 'Blinding Lights', artist: 'The Weeknd', category: 'Pop', plays: 12000000 },
            { id: 3, title: 'Shape of You', artist: 'Ed Sheeran', category: 'Pop', plays: 11000000 },
          ]),
      })
    ) as jest.Mock;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches songs successfully', async () => {
    const { result } = renderHook(() => useSongs(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      { id: 1, title: 'Bohemian Rhapsody', artist: 'Queen', category: 'Rock', plays: 15000000 },
      { id: 2, title: 'Blinding Lights', artist: 'The Weeknd', category: 'Pop', plays: 12000000 },
      { id: 3, title: 'Shape of You', artist: 'Ed Sheeran', category: 'Pop', plays: 11000000 },
    ]);
  });

  it('handles fetch error', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false })) as jest.Mock;

    const { result } = renderHook(() => useSongs(), { wrapper });

  });
});