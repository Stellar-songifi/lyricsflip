import { useCallback, useState } from 'react';
import { LyricsFlipClient } from '@/lib/contracts/lyricsflip';

export type QuestionMode = 'TitleOnly' | 'Mixed' | 'ArtistOnly' | 'YearOnly';

export interface UseCreateRoundResult {
  createRound: (params: {
    roundId: bigint;
    pot: bigint;
    questionMode?: QuestionMode;
  }) => Promise<void>;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook for creating a round. The contract draws cards using the
 * network PRNG, so the caller no longer supplies a seed (no more
 * `BigInt(Date.now())`).
 *
 * The `questionMode` controls which kinds of questions the round asks
 * (TitleOnly, Mixed, ArtistOnly, YearOnly). It defaults to `TitleOnly`
 * for backwards compatibility.
 */
export function useCreateRound(contractId: string, publicKey?: string): UseCreateRoundResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createRound = useCallback(
    async (params: { roundId: bigint; pot: bigint; questionMode?: QuestionMode }) => {
      setLoading(true);
      setError(null);
      try {
        const client = new LyricsFlipClient(contractId, publicKey);
        await client.createRound({
          roundId: params.roundId,
          pot: params.pot,
          questionMode: params.questionMode ?? 'TitleOnly',
        });
      } catch (e) {
        setError(e as Error);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [contractId, publicKey],
  );

  return { createRound, loading, error };
}