import { env } from '@/env';
import type { LyricData } from '@/store/game-types';

/** Song as returned by `GET /songs` (backend `Song` entity). */
export interface Song {
  id: string;
  title: string;
  artist: string;
  year: number;
  genre: string;
  lyrics: string;
  difficulty: string;
  [key: string]: unknown;
}

/** Category as returned by `GET /categories`. */
export interface Category {
  id: string;
  name: string;
  [key: string]: unknown;
}

const getJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}`);
  }
  return response.json() as Promise<T>;
};

export const fetchSongs = (genre?: string): Promise<Song[]> =>
  getJson<Song[]>(
    genre ? `/songs?genre=${encodeURIComponent(genre)}` : '/songs',
  );

export const fetchCategories = (): Promise<Category[]> =>
  getJson<Category[]>('/categories');

export const fetchLyrics = async (): Promise<LyricData[]> => {
  try {
    return await getJson<LyricData[]>('/songs/lyrics');
  } catch {
    return [];
  }
};