import type { LyricData } from '@/store/game-types';

export const MOCK_LYRICS: LyricData[] = [
  {
    text: 'Is this the real life? Is this just fantasy?',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    options: [
      { title: 'Bohemian Rhapsody', artist: 'Queen' },
      { title: 'Hotel California', artist: 'Eagles' },
      { title: 'Stairway to Heaven', artist: 'Led Zeppelin' },
      { title: 'Imagine', artist: 'John Lennon' },
    ],
  },
  {
    text: "I've been tryna call, I've been on my own for long enough",
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    options: [
      { title: 'Blinding Lights', artist: 'The Weeknd' },
      { title: 'Levitating', artist: 'Dua Lipa' },
      { title: 'Watermelon Sugar', artist: 'Harry Styles' },
      { title: 'Shape of You', artist: 'Ed Sheeran' },
    ],
  },
  {
    text: "The club isn't the best place to find a lover",
    title: 'Shape of You',
    artist: 'Ed Sheeran',
    options: [
      { title: 'Shape of You', artist: 'Ed Sheeran' },
      { title: 'Perfect', artist: 'Ed Sheeran' },
      { title: 'Blinding Lights', artist: 'The Weeknd' },
      { title: 'Stay', artist: 'Justin Bieber' },
    ],
  },
];
