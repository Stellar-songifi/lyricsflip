/**
 * Mirrors the contract's `Genre` enum (onchain/contracts/lyricsflip/src/types.rs).
 * Member order is the contract's `u32` discriminant, and the string values match
 * `GENRE_VALUES` in frontend/src/lib/stellar/types.ts. Keep all three in sync.
 */
export enum Genre {
  HipHop = 'HipHop',
  Pop = 'Pop',
  Rock = 'Rock',
  RnB = 'RnB',
  Electronic = 'Electronic',
  Classical = 'Classical',
  Jazz = 'Jazz',
  Country = 'Country',
  Blues = 'Blues',
  Reggae = 'Reggae',
  Afrobeat = 'Afrobeat',
  Gospel = 'Gospel',
  Folk = 'Folk',
}

export const GENRE_VALUES: readonly Genre[] = Object.values(Genre);

/** Converts a `Genre` into the `u32` discriminant the contract expects. */
export const genreToWire = (genre: Genre): number => GENRE_VALUES.indexOf(genre);

/** Converts a contract `u32` genre discriminant back into a `Genre`. */
export const genreFromWire = (value: number): Genre => {
  const genre = GENRE_VALUES[value];
  if (!genre) {
    throw new Error(`Unknown Genre discriminant: ${value}`);
  }
  return genre;
};
