import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

/** Code of the Stellar asset used for wagers (e.g. `XLM`). */
export const WAGER_ASSET_CODE = process.env.NEXT_PUBLIC_WAGER_ASSET_CODE || 'XLM';

/** Stellar assets use 7 decimal places. */
export const STELLAR_DECIMALS = 7;

/**
 * Format an on-chain i128 amount (in the asset's smallest unit) as a
 * human-readable decimal string with thousands separators.
 */
export const formatAmount = (
  amount: bigint | number | string,
  decimals: number = STELLAR_DECIMALS,
): string => {
  let value = BigInt(amount);
  const negative = value < BigInt(0);
  if (negative) value = -value;

  const base = BigInt(10) ** BigInt(decimals);
  const whole = (value / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = decimals > 0
    ? (value % base).toString().padStart(decimals, '0').replace(/0+$/, '')
    : '';

  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
};

export const GENRE_LYRICS = {
  pop: [
    {
      text: 'Lyric snippet for Pop Song 1',
      title: 'Pop Song 1',
      artist: 'Pop Artist 1',
      options: [
        { title: 'Pop Song 1', artist: 'Pop Artist 1' },
        { title: 'Pop Song 2', artist: 'Pop Artist 2' },
        { title: 'Pop Song 3', artist: 'Pop Artist 3' },
        { title: 'Pop Song 4', artist: 'Pop Artist 4' },
      ],
    },
    {
      text: 'Lyric snippet for Pop Song 2',
      title: 'Pop Song 2',
      artist: 'Pop Artist 2',
      options: [
        { title: 'Pop Song 1', artist: 'Pop Artist 1' },
        { title: 'Pop Song 2', artist: 'Pop Artist 2' },
        { title: 'Pop Song 3', artist: 'Pop Artist 3' },
        { title: 'Pop Song 4', artist: 'Pop Artist 4' },
      ],
    },
    {
      text: 'Lyric snippet for Pop Song 3',
      title: 'Pop Song 3',
      artist: 'Pop Artist 3',
      options: [
        { title: 'Pop Song 1', artist: 'Pop Artist 1' },
        { title: 'Pop Song 2', artist: 'Pop Artist 2' },
        { title: 'Pop Song 3', artist: 'Pop Artist 3' },
        { title: 'Pop Song 4', artist: 'Pop Artist 4' },
      ],
    },
  ],
  rock: [
    {
      text: 'Lyric snippet for Rock Song 1',
      title: 'Rock Song 1',
      artist: 'Rock Artist 1',
      options: [
        { title: 'Rock Song 1', artist: 'Rock Artist 1' },
        { title: 'Rock Song 2', artist: 'Rock Artist 2' },
        { title: 'Rock Song 3', artist: 'Rock Artist 3' },
        { title: 'Rock Song 4', artist: 'Rock Artist 4' },
      ],
    },
  ],
  hiphop: [
    {
      text: 'Lyric snippet for Hip Hop Song 1',
      title: 'Hip Hop Song 1',
      artist: 'Hip Hop Artist 1',
      options: [
        { title: 'Hip Hop Song 1', artist: 'Hip Hop Artist 1' },
        { title: 'Hip Hop Song 2', artist: 'Hip Hop Artist 2' },
        { title: 'Hip Hop Song 3', artist: 'Hip Hop Artist 3' },
        { title: 'Hip Hop Song 4', artist: 'Hip Hop Artist 4' },
      ],
    },
  ],
  rnb: [
    {
      text: 'Lyric snippet for R&B Song 1',
      title: 'R&B Song 1',
      artist: 'R&B Artist 1',
      options: [
        { title: 'R&B Song 1', artist: 'R&B Artist 1' },
        { title: 'R&B Song 2', artist: 'R&B Artist 2' },
        { title: 'R&B Song 3', artist: 'R&B Artist 3' },
        { title: 'R&B Song 4', artist: 'R&B Artist 4' },
      ],
    },
  ],
};