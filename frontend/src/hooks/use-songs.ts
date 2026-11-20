import { useQuery } from '@tanstack/react-query';
import { fetchSongs } from '../services/music-service';

export interface UseSongsOptions {
  genre?: string;
  enabled?: boolean;
}

export const useSongs = (options: UseSongsOptions = {}) => {
  const { genre, enabled = true } = options;

  const query = useQuery({
    queryKey: ['songs', genre ?? 'all'],
    queryFn: () => fetchSongs(genre),
    staleTime: 5 * 60 * 1000,
    enabled,
    retry: 1,
  });

  return {
    ...query,
    isOffline: query.isError,
  };
};