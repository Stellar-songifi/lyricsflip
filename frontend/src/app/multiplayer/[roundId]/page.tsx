'use client';

import { Button } from '@/components/atoms/button';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { ArrowLeft } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function MultiplayerRoundPage() {
  const router = useRouter();
  const params = useParams<{ roundId?: string | string[] }>();
  const rawRoundId = Array.isArray(params?.roundId)
    ? params.roundId[0]
    : params?.roundId;
  const roundId = rawRoundId && /^\d+$/.test(rawRoundId) ? BigInt(rawRoundId) : null;

  const { systemCalls, account, connect } = useStellar();
  const [status, setStatus] = useState('Loading round...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId || !systemCalls) {
      if (roundId === null) {
        setError('That invite link is not valid.');
      } else {
        setStatus('Waiting for contract connection...');
      }
      return;
    }

    let ignore = false;

    const run = async () => {
      try {
        setError(null);
        const round = await systemCalls.getRound(roundId);
        if (!ignore) {
          setStatus(`Round loaded: ${round.round_id.toString()}`);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load round');
        }
      }
    };

    run();
    return () => {
      ignore = true;
    };
  }, [roundId, systemCalls]);

  const handleBack = () => router.push('/multiplayer');

  return (
    <div className="container mx-auto px-4 py-8">
      <button
        onClick={handleBack}
        className="flex items-center text-gray-600 mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </button>

      <h1 className="text-3xl font-bold mb-4">Multiplayer Round</h1>
      <p className="text-gray-600 mb-4">Round ID: {rawRoundId ?? 'unknown'}</p>
      <p>{status}</p>

      {!account && (
        <Button onClick={() => connect()} className="mt-4">
          Connect wallet
        </Button>
      )}

      {error && <p className="text-red-500 mt-4">{error}</p>}
    </div>
  );
}
