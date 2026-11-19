import { QuestionCard } from './question-card';
import type { SongOption } from '@/lib/stellar/types';

const titleOptions: SongOption[] = [
  { title: 'Song One', artist: '' },
  { title: 'Song Two', artist: '' },
  { title: 'Song Three', artist: '' },
  { title: 'Song Four', artist: '' },
];

const artistOptions: SongOption[] = [
  { title: 'Artist One', artist: '' },
  { title: 'Artist Two', artist: '' },
  { title: 'Artist Three', artist: '' },
  { title: 'Artist Four', artist: '' },
];

const yearOptions: SongOption[] = [
  { title: '2015', artist: '' },
  { title: '2018', artist: '' },
  { title: '2021', artist: '' },
  { title: '2023', artist: '' },
];

// Storybook stories for each question kind (LF-308).
export default {};

export const TitleKind = () => (
  <QuestionCard kind="Title" options={titleOptions} onSelect={() => {}} />
);

export const ArtistKind = () => (
  <QuestionCard kind="Artist" options={artistOptions} onSelect={() => {}} />
);

export const YearKind = () => (
  <QuestionCard kind="Year" options={yearOptions} onSelect={() => {}} />
);
