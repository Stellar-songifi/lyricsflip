/**
 * Client for the public practice endpoint (LF-326 / issue #912).
 *
 * GET /api/v1/practice returns 5 random lyric cards with shuffled answer
 * options. No auth token is required.
 */
import { get } from './api';

export interface PracticeCard {
  id: string;
  lyrics: string;
  title: string;
  artist: string;
  year: number;
  genre: string;
  /** Four shuffled title options; one is correct. */
  options: string[];
}

export interface PracticeRound {
  cards: PracticeCard[];
  total: number;
}

/** Fetches a fresh practice round from the backend. */
export async function fetchPracticeRound(): Promise<PracticeRound> {
  return get<PracticeRound>('/practice');
}

/** Fallback cards used when the API is unavailable (e.g. development without backend). */
export const FALLBACK_PRACTICE_CARDS: PracticeCard[] = [
  {
    id: 'demo-1',
    lyrics: "I keep bleeding, keep keep bleeding love\nYou cut me open and I",
    title: 'Bleeding Love',
    artist: 'Leona Lewis',
    year: 2007,
    genre: 'Pop',
    options: ['Bleeding Love', 'Halo', 'Rolling in the Deep', 'Someone Like You'],
  },
  {
    id: 'demo-2',
    lyrics: "We found love in a hopeless place\nWe found love in a hopeless place",
    title: 'We Found Love',
    artist: 'Rihanna ft. Calvin Harris',
    year: 2011,
    genre: 'Pop',
    options: ['We Found Love', 'Umbrella', 'Work', 'Diamonds'],
  },
  {
    id: 'demo-3',
    lyrics: "Hello from the other side\nI must have called a thousand times",
    title: 'Hello',
    artist: 'Adele',
    year: 2015,
    genre: 'Pop',
    options: ['Hello', 'Someone Like You', 'Rolling in the Deep', 'Skyfall'],
  },
  {
    id: 'demo-4',
    lyrics: "Started from the bottom, now we here\nStarted from the bottom, now my whole team here",
    title: 'Started From the Bottom',
    artist: 'Drake',
    year: 2013,
    genre: 'HipHop',
    options: ['Started From the Bottom', 'God\'s Plan', 'Hotline Bling', 'One Dance'],
  },
  {
    id: 'demo-5',
    lyrics: "I got the eye of the tiger, a fighter\nDancing through the fire",
    title: 'Roar',
    artist: 'Katy Perry',
    year: 2013,
    genre: 'Pop',
    options: ['Roar', 'Firework', 'Dark Horse', 'Teenage Dream'],
  },
];
