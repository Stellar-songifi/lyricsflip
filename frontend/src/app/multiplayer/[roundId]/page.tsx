'use client';
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
import type { Round } from '@/lib/stellar/types';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

export default function MultiplayerRoundPage() {
  const t = useTranslations('lobby');
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
    isValidId ? null : t('invalidInvite'),
  );

  const events = useRoundEvents(roundId);
  const allPlayers = Array.from(new Set([...players, ...events.joined]));
  const isStarted = !!round?.is_started || events.started;
  const isReady = !!account && events.ready.includes(account.address);

  const { roomData, selectSong } = useMultiplayerRoom({
    roomId: isStarted ? rawRoundId : '',
    playerName: account?.address ?? 'Guest',
  });

  const loadRound = useCallback(async () => {
    if (!systemCalls || roundId === null) return undefined;
    setIsLoading(true);
    try {
      const [roundData, roundPlayers] = await Promise.all([
        systemCalls.getRound(roundId),
        systemCalls.getRoundPlayers(roundId),
      ]);
      setRound(roundData);
      setPlayers(roundPlayers);
      return { roundData, roundPlayers };
    } catch {
      setError(t('roundNotFound', { roundId: rawRoundId }));
      return undefined;
    } finally {
      setIsLoading(false);
    }
  }, [systemCalls, roundId, rawRoundId]);

  // Load the round, then join it once a wallet is connected.
  useEffect(() => {
    if (!systemCalls || roundId === null) {
      if (roundId === null) setIsLoading(false);
      return;
    }
    const run = async () => {
      const loaded = await loadRound();
      if (!loaded || !account) return;
      const { roundData, roundPlayers } = loaded;
      if (roundData.is_cancelled || roundData.is_completed) {
        setError(t('roundClosed'));
        return;
      }
      if (roundData.is_started || roundPlayers.includes(account.address))
        return;
      try {
        setIsBusy(true);
        await systemCalls.joinRound(roundId);
        await loadRound();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('failedJoin'));
      } finally {
        setIsBusy(false);
      }
    };
    run();
  }, [systemCalls, roundId, account, loadRound]);

  const handleReady = async () => {
    if (!systemCalls || roundId === null) return;
    setIsBusy(true);
    setError(null);
    try {
      await systemCalls.startRound(roundId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedReady'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleBack = () => router.push('/multiplayer');

  const shell = (content: React.ReactNode) => (
    <div className="container mx-auto px-4 py-8">
      <button
        onClick={handleBack}
        className="flex items-center text-gray-600 mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        {t('back')}
      </button>
      {content}
    </div>
  );

  if (error && !round) {
    return shell(<p className="text-red-500">{error}</p>);
  }

  if (isLoading || !round) {
    return shell(<p>{t('loadingRound')}</p>);
  }

  if (!account) {
    return shell(
      <div className="max-w-md mx-auto text-center">
        <p className="mb-4">{t('connectWalletToJoin', { id: rawRoundId })}</p>
        <Button onClick={() => connect()} className="w-full">
          {t('connectWallet')}
        </Button>
      </div>,
    );
  }

  if (!isStarted) {
    return shell(
      <>
        <div className="max-w-md mx-auto mb-6">
          <h2 className="text-xl font-bold mb-2">
            {t('players', { count: allPlayers.length })}
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-start-2 lg:col-span-1 order-1 lg:order-2">
          <LyricCard
            lyrics={[
              {
                text: roomData?.currentLyric?.text || t('waitingFirstCard'),
                title: roomData?.currentLyric?.title || '',
                artist: roomData?.currentLyric?.artist || '',
              },
            ]}
            isFlipped={false}
          />
        </div>
        <div className="lg:col-start-3 lg:col-span-1 order-2 lg:order-3">
          <StatisticsPanel
            time={roomData?.timeLeft || '00:00'}
            potWin={`${round.wager_amount.toString()}`}
            scores={`${roomData?.scores || 0}`}
          />
        </div>
      </div>
      {roomData?.songOptions && (
        <SongOptions
          options={roomData.songOptions}
          onSelect={(_, index) => selectSong(index)}
          groupLabel={t('songOptions')}
        />
      )}
    </>,
  );
}
