/**
 * Human-readable display names for every on-chain Genre variant.
 *
 * Ordering and variant names must stay in sync with:
 *   `onchain/contracts/lyricsflip/src/types.rs` → `Genre`
 *   `frontend/src/lib/stellar/types.ts` → `GENRE_VALUES`
 */

import { GENRE_VALUES, type Genre } from './types';

/** Maps each Genre variant to a friendly UI label. */
export const GENRE_DISPLAY_NAMES: Record<Genre, string> = {
  HipHop: 'Hip Hop',
  Pop: 'Pop',
  Rock: 'Rock',
  RnB: 'R&B',
  Electronic: 'Electronic',
  Classical: 'Classical',
  Jazz: 'Jazz',
  Country: 'Country',
  Blues: 'Blues',
  Reggae: 'Reggae',
  Afrobeat: 'Afrobeat',
  Gospel: 'Gospel',
  Folk: 'Folk',
};

/**
 * Returns the friendly display name for a Genre variant.
 * Falls back to the raw variant string if no mapping exists (future-proofing).
 */
export const getGenreDisplayName = (genre: Genre): string =>
  GENRE_DISPLAY_NAMES[genre] ?? genre;

/**
 * All genres as `{ value, label }` pairs ready for use in `<select>` or
 * Radix UI `<SelectItem>` elements.
 */
export const GENRE_OPTIONS: { value: Genre; label: string }[] = GENRE_VALUES.map(
  (genre) => ({
    value: genre,
    label: getGenreDisplayName(genre),
  }),
);
