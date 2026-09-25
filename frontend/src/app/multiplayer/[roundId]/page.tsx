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

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { LyricCard } from '@/components/organisms/LyricCard';
import { StatisticsPanel } from '@/components/molecules/statistics-panel';
import { SongOptions } from '@/components/molecules/song-options';
import ChallengeInvite from '@/components/organisms/challangeInvite';
import { Button } from '@/components/atoms/button';
import { useMultiplayerRoom } from '@/hooks/use-multiplayer-room';
import { useRoundEvents } from '@/hooks/useRoundEvents';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { useCallback, useEffect, useState } from 'react';
import type { Round } from '@/lib/stellar/types';

const parseRoundId = (value: string | string[] | undefined): bigint | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^\d+$/.test(raw) ? BigInt(raw) : null;
};

export default function MultiplayerRoundPage() {
  const router = useRouter();
  const params = useParams<{ roundId: string }>();
  const rawRoundId = params?.roundId ?? '';
  const isValidId = /^\d+$/.test(rawRoundId);
  const roundId = isValidId ? BigInt(rawRoundId) : null;

  const { systemCalls, account, connect } = useStellar();
  const [round, setRound] = useState<Round | null>(null);
  const [players, setPlayers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    isValidId ? null : 'That invite link is not valid.',
  );

  const events = useRoundEvents(round ? roundId : null);
  const allPlayers = Array.from(new Set([...players, ...events.joined]));
  const isStarted = !!round?.is_started || events.started;
  const isReady = !!account && events.ready.includes(account.address);

  const { roomData, selectSong } = useMultiplayerRoom({
    roomId: isStarted ? rawRoundId : '',
    playerName: account?.address ?? 'Guest',
  });

  const loadRound = useCallback(async () => {
    if (!systemCalls || roundId === null) return;
    try {
      const [roundData, roundPlayers] = await Promise.all([
        systemCalls.getRound(roundId),
        systemCalls.getRoundPlayers(roundId),
      ]);
      setRound(roundData);
      setPlayers(roundPlayers);
      return { roundData, roundPlayers };
    } catch {
      setError(`Round ${rawRoundId} does not exist or could not be loaded.`);
    } finally {
      setIsLoading(false);
    }
  }, [systemCalls, roundId, rawRoundId]);

  // Load the round, then auto-join it if a wallet is connected.
  useEffect(() => {
    if (!systemCalls || roundId === null) {
      if (roundId === null) setIsLoading(false);
      return;
    }
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
  const shell = (content: React.ReactNode) => (
    <div className="container mx-auto px-4 py-8 mt-16 md:mt-20">
      <button
        onClick={handleBack}
        className="flex items-center text-gray-600 mb-4 min-h-[44px]"
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
  if (!account) {
    return shell(
      <div className="max-w-md mx-auto text-center">
        <p className="mb-4">Connect your wallet to join round {rawRoundId}.</p>
        <Button onClick={() => connect()} className="w-full min-h-[44px]">
          Connect wallet
        </Button>
      </div>,
    );
  }

  if (!isStarted) {
    return shell(
      <>
        <div className="max-w-md mx-auto mb-6">
          <h2 className="text-xl font-bold mb-2">
            Players ({allPlayers.length})
          </h2>
          <ul className="space-y-1">
            {allPlayers.map((p) => (
              <li key={p} className="flex justify-between text-sm">
                <span className="truncate mr-2">
                  {p === account.address ? `${p} (you)` : p}
                </span>
                <span
                  className={
                    events.ready.includes(p)
                      ? 'text-green-600'
                      : 'text-gray-500'
                  }
                >
                  {events.ready.includes(p) ? 'Ready' : 'Not ready'}
                </span>
              </li>
            ))}
          </ul>
          {error && <p className="text-red-500 mt-4">{error}</p>}
          {events.error && (
            <p className="text-red-500 mt-2 text-sm">{events.error}</p>
          )}
        </div>
        <ChallengeInvite
          round={round}
          players={allPlayers}
          isReady={isReady}
          isBusy={isBusy}
          onReady={handleReady}
        />
      </>,
    );
  }

  return shell(
    <>
      <h1 className="text-2xl font-bold mb-6">
        {roomData?.name || `Round ${rawRoundId}`}
      </h1>

      {/* Responsive game grid:
          - Mobile (< 768px): single column, LyricCard on top, stats below
          - Tablet (768px): 2-col layout
          - Desktop (1024px+): 3-col layout with LyricCard centred  */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Statistics panel — left on tablet+, below lyric card on mobile */}
        <div className="order-2 md:order-1 lg:col-span-1">
          <StatisticsPanel
            time={roomData?.timeLeft || '00:00'}
            potWin={`${round.wager_amount.toString()}`}
            scores={`${roomData?.scores || 0}`}
          />
        </div>

        {/* Lyric card — full width on mobile, centred column on desktop */}
        <div className="order-1 md:order-2 lg:col-span-1">
          <LyricCard
            lyrics={[
              {
                text:
                  roomData?.currentLyric?.text || 'Waiting for the first card…',
                title: roomData?.currentLyric?.title || '',
                artist: roomData?.currentLyric?.artist || '',
              },
            ]}
            isFlipped={false}
          />
        </div>
      </div>

      {/* Song options */}
      {roomData?.songOptions && (
        <SongOptions
          options={roomData.songOptions}
          onSelect={(_, index) => selectSong(index)}
        />
      )}

      {error && <p className="text-red-500 mt-4">{error}</p>}
    </div>
  );
}
