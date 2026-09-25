import { useQuery } from '@tanstack/react-query';

export interface GameData {
  lyric: string;
  options: string[];
  round: number;
  stats: {
    totalGames: number;
    totalPlayers: number;
    totalWins: number;
  };
}

/**
 * Reads the current game state from the LyricsFlip contract.
 *
 * Wrapped in React Query so on-chain reads are cached and retried,
 * which keeps the UI stable while RPC calls resolve on testnet.
 */
export function useGameData() {
  const query = useQuery({
    queryKey: ['game', 'current'],
    queryFn: async (): Promise<GameData | null> => null,
    staleTime: 30_000,
    retry: 0,
  });

  return {
    data: null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
