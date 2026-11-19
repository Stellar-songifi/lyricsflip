import type { Metadata } from 'next';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/atoms/button';
import ChallengeInvite from '@/components/organisms/challenge-invite';
import { LyricCard } from '@/components/organisms/lyric-card';
import RoundScoreboard from '@/components/organisms/round-scoreboard';
import { SongOptions } from '@/components/molecules/song-options';
import {
  CARD_TIMEOUT_SECONDS,
  useCardTimer,
} from '@/features/game/hooks/use-card-timer';
import { useRoundEvents } from '@/hooks/use-round-events';
import { useRoundGameEvents } from '@/hooks/use-round-game-events';
import { useStellar } from '@/lib/stellar/hooks/use-stellar';
import { getContractErrorCode, parseContractError } from '@/lib/stellar/errors';
import { getGenreDisplayName } from '@/lib/stellar/genres';
import {
  Answer,
  type QuestionCard,
  type Round,
} from '@/lib/stellar/types';
import { formatTime } from '@/lib/utils';
import { useProfileStore } from '@/store/use-profile-store';

/** Contract error code for `NoMoreCards` — the player has drawn every card. */
const NO_MORE_CARDS = 34;

interface SongOption {
  title: string;
  artist: string;
}

type AnswerOutcome = 'correct' | 'wrong' | 'miss';

function parseRoundId(raw: string): bigint | null {
  return /^\d+$/.test(raw) ? BigInt(raw) : null;
}

type RoundPageProps = {
  params: Promise<{ roundId: string }>;
};

export async function generateMetadata({
  params,
}: RoundPageProps): Promise<Metadata> {
  const { roundId } = await params;
  const title = `Round ${roundId}`;
  const description = `Join multiplayer round ${roundId} on LyricsFlip — guess the song from the lyric and climb the leaderboard.`;
  const url = `/multiplayer/${roundId}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

/**
 * Seconds left until an absolute unix-seconds deadline, updated once a second.
 * `null` means "no deadline yet" (round not started / malformed value).
 */
function useDeadlineCountdown(deadlineSeconds: number | null): number | null {
  const [nowSeconds, setNowSeconds] = useState(() =>
    Math.floor(Date.now() / 1000),
  );

  useEffect(() => {
    if (deadlineSeconds === null) return;
    const tick = () => setNowSeconds(Math.floor(Date.now() / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadlineSeconds]);

  return deadlineSeconds === null
    ? null
    : Math.max(0, deadlineSeconds - nowSeconds);
}

const toDeadlineSeconds = (round: Round | null): number | null => {
  if (!round) return null;
  const seconds = Number(round.end_time);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

export default function MultiplayerRoundPage() {
  return <MultiplayerRoundClient />;
}

function MultiplayerRoundClient() {
  const router = useRouter();
  const params = useParams<{ roundId?: string | string[] }>();
  const rawRoundId = Array.isArray(params?.roundId)
    ? params.roundId[0]
    : params?.roundId ?? '';
  const roundId = parseRoundId(rawRoundId);
  const isValidId = roundId !== null;

  const { systemCalls, account, connect } = useStellar();
  const profiles = useProfileStore((state) => state.profiles);
  const fetchProfile = useProfileStore((state) => state.fetchProfile);
  const [round, setRound] = useState<Round | null>(null);
  const [players, setPlayers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    isValidId ? null : 'That invite link is not valid.',
  );

  // ── Game state (LF-195) ───────────────────────────────────────────────────
  const [card, setCard] = useState<QuestionCard | null>(null);
  const [question, setQuestion] = useState<QuestionCard | null>(null);
  const [selectedOption, setSelectedOption] = useState<SongOption | null>(null);
  const [answerOutcome, setAnswerOutcome] = useState<AnswerOutcome | null>(null);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasFinishedCards, setHasFinishedCards] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const [finalScoreFallback, setFinalScoreFallback] = useState<
    Record<string, number> | null
  >(null);
  const hasDrawnFirstCard = useRef(false);
  const refreshedForStart = useRef(false);

  // Next.js keeps this page mounted when only the dynamic segment changes, so
  // clear the previous round's game state when navigating to another round.
  useEffect(() => {
    hasDrawnFirstCard.current = false;
    refreshedForStart.current = false;
    setRound(null);
    setPlayers([]);
    setCard(null);
    setQuestion(null);
    setSelectedOption(null);
    setAnswerOutcome(null);
    setIsCardFlipped(false);
    setHasFinishedCards(false);
    setFinalScoreFallback(null);
    setGameError(null);
    setIsLoading(true);
  }, [roundId]);

  const lobbyEvents = useRoundEvents(round ? roundId : null);
  const gameEvents = useRoundGameEvents(
    round?.is_started ? roundId : null,
  );
  const allPlayers = Array.from(
    new Set([...players, ...lobbyEvents.joined]),
  );
  const isStarted = !!round?.is_started || lobbyEvents.started;
  const isReady = !!account && lobbyEvents.ready.includes(account.address);
  const isParticipant =
    !!account && players.includes(account.address);
  const isCompleted = !!round?.is_completed || gameEvents.completed;

  const loadRound = useCallback(async () => {
    if (!systemCalls || roundId === null) return null;
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
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [systemCalls, roundId, rawRoundId]);

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
        return;
      }
      if (roundData.is_started || roundPlayers.includes(account.address)) return;

      try {
        setIsBusy(true);
        await systemCalls.joinRound(roundId);
        await loadRound();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to join round');
      } finally {
        setIsBusy(false);
      }
    };

    void run();
  }, [systemCalls, roundId, account, loadRound]);

  const handleReady = useCallback(async () => {
    if (!systemCalls || roundId === null) return;
    setIsBusy(true);
    setError(null);
    try {
      await systemCalls.startRound(roundId);
      await loadRound();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark ready');
    } finally {
      setIsBusy(false);
    }
  }, [systemCalls, roundId, loadRound]);

  // Another player may start the round: the lobby stream sees `RoundStarted`
  // before our cached round does, so refresh it once to pick up `end_time`.
  useEffect(() => {
    if (!lobbyEvents.started || !round || round.is_started) return;
    if (!systemCalls || refreshedForStart.current) return;
    refreshedForStart.current = true;
    void loadRound();
  }, [lobbyEvents.started, round, systemCalls, loadRound]);

  // ── Card play ─────────────────────────────────────────────────────────────
  const drawCard = useCallback(async () => {
    if (!systemCalls || roundId === null) return;
    setIsDrawing(true);
    setGameError(null);
    setSelectedOption(null);
    setAnswerOutcome(null);
    setIsCardFlipped(false);
    setQuestion(null);
    setCard(null);
    try {
      const nextCard = await systemCalls.nextCard(roundId);
      setCard(nextCard);
      setQuestion(nextCard);
    } catch (err) {
      if (getContractErrorCode(err) === NO_MORE_CARDS) {
        // Every card in the round has been drawn for this player; the round
        // is finalized by any player (or the keeper) once the deadline passes.
        setHasFinishedCards(true);
      } else {
        setGameError(parseContractError(err).message);
      }
    } finally {
      setIsDrawing(false);
    }
  }, [systemCalls, roundId]);

  // Draw the first card once the round has started, for players only.
  useEffect(() => {
    if (!round?.is_started || !isParticipant || !systemCalls) return;
    if (hasDrawnFirstCard.current) return;
    hasDrawnFirstCard.current = true;
    void drawCard();
  }, [round?.is_started, isParticipant, systemCalls, drawCard]);

  const handleCardTimeout = useCallback(() => {
    setIsCardFlipped(true);
    setAnswerOutcome('miss');
  }, []);

  const cardTimerActive =
    !!question && selectedOption === null && !isCardFlipped && !isSubmitting;

  const {
    timeLeft: cardTimeLeft,
    reset: resetCardTimer,
  } = useCardTimer({
    isActive: cardTimerActive,
    onTimeout: handleCardTimeout,
  });

  const handleAnswer = useCallback(
    async (option: SongOption) => {
      if (!systemCalls || roundId === null || !card || selectedOption !== null) {
        return;
      }
      setSelectedOption(option);
      setIsCardFlipped(true);
      setAnswerOutcome(null);
      setIsSubmitting(true);
      try {
        const isCorrect = await systemCalls.submitAnswer(
          roundId,
          Answer.title(option.title),
        );
        setAnswerOutcome(isCorrect ? 'correct' : 'wrong');
      } catch (err) {
        setGameError(parseContractError(err).message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [card, roundId, selectedOption, systemCalls],
  );

  const handleNextCard = useCallback(async () => {
    resetCardTimer();
    await drawCard();
  }, [drawCard, resetCardTimer]);

  // ── Round deadline / finalization ─────────────────────────────────────────
  const secondsLeft = useDeadlineCountdown(toDeadlineSeconds(round));
  const deadlinePassed = secondsLeft === 0;
  const canFinalize = isParticipant && deadlinePassed && !isCompleted;

  const handleFinalize = useCallback(async () => {
    if (!systemCalls || roundId === null) return;
    setIsFinalizing(true);
    setGameError(null);
    try {
      await systemCalls.finalizeRound(roundId);
      await loadRound();
    } catch (err) {
      setGameError(parseContractError(err).message);
    } finally {
      setIsFinalizing(false);
    }
  }, [systemCalls, roundId, loadRound]);

  // ── Scoreboard data ───────────────────────────────────────────────────────
  // `RoundCompleted` carries the authoritative scores, but if the event stream
  // was unavailable fall back to the contract's `get_round_scores` view.
  useEffect(() => {
    if (!isCompleted || gameEvents.finalScores) return;
    if (!systemCalls || roundId === null) return;
    let cancelled = false;
    systemCalls
      .getRoundScores(roundId)
      .then((scores) => {
        if (!cancelled) setFinalScoreFallback(scores);
      })
      .catch(() => {
        // The event-derived scores already on screen are the fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [isCompleted, gameEvents.finalScores, systemCalls, roundId]);

  const mergedScores = useMemo(() => {
    if (gameEvents.finalScores) return gameEvents.finalScores;
    if (finalScoreFallback) return finalScoreFallback;
    return gameEvents.scores;
  }, [gameEvents.finalScores, gameEvents.scores, finalScoreFallback]);

  const winners = useMemo(() => {
    if (gameEvents.winners) return gameEvents.winners;
    if (!isCompleted) return null;
    const best = Math.max(0, ...Object.values(mergedScores));
    if (best === 0) return [];
    return Object.entries(mergedScores)
      .filter(([, points]) => points === best)
      .map(([player]) => player);
  }, [gameEvents.winners, isCompleted, mergedScores]);

  const scoreboardPlayers = useMemo(
    () =>
      Array.from(
        new Set([
          ...allPlayers,
          ...Object.keys(mergedScores),
          ...Object.keys(gameEvents.answered),
        ]),
      ),
    [allPlayers, mergedScores, gameEvents.answered],
  );

  // ── Profiles (LF-230) ─────────────────────────────────────────────────────
  // Fetch any player profile we don't have yet so the UI can show usernames
  // instead of raw `G…` addresses. Failures fall back to the address.
  useEffect(() => {
    for (const player of scoreboardPlayers) {
      if (!profiles[player]) void fetchProfile(player);
    }
  }, [scoreboardPlayers, profiles, fetchProfile]);

  const displayName = useCallback(
    (address: string) => profiles[address]?.username || address,
    [profiles],
  );

  const options: SongOption[] = question
    ? [
        question.option_one,
        question.option_two,
        question.option_three,
        question.option_four,
      ].map((title) => ({ title, artist: '' }))
    : [];

  const shell = useCallback(
    (content: ReactNode) => (
      <div className="container mx-auto mt-16 px-4 py-8 md:mt-20">
        <button
          onClick={() => router.push('/multiplayer')}
          className="mb-4 flex min-h-[44px] items-center text-gray-600"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </button>
        {content}
      </div>
    ),
    [router],
  );

  if (!isValidId) {
    return shell(
      <p className="mx-auto max-w-md text-center text-red-500">{error}</p>,
    );
  }

  if (!account) {
    return shell(
      <div className="mx-auto max-w-md text-center">
        <p className="mb-4">Connect your wallet to join round {rawRoundId}.</p>
        <Button onClick={() => connect()} className="min-h-[44px] w-full">
          Connect wallet
        </Button>
      </div>,
    );
  }

  if (isLoading) {
    return shell(<p className="text-gray-600">Loading round…</p>);
  }

  if (!round) {
    return shell(<p className="text-red-500">{error ?? 'Round not found.'}</p>);
  }

  if (round.is_cancelled) {
    return shell(
      <p className="mx-auto max-w-md text-center text-red-500">
        This round was cancelled.
      </p>,
    );
  }

  // ── Final results ─────────────────────────────────────────────────────────
  if (isCompleted) {
    return shell(
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-bold">Round {rawRoundId} results</h1>
          <p className="text-gray-600">{getGenreDisplayName(round.genre)}</p>
        </header>

        <p role="status" className="text-lg font-semibold">
          {winners && winners.length > 0
            ? winners.includes(account.address)
              ? 'You won!'
              : `${winners.length} winner${winners.length === 1 ? '' : 's'}`
            : 'Round complete — no points were scored.'}
        </p>

        <RoundScoreboard
          players={scoreboardPlayers}
          scores={mergedScores}
          answered={gameEvents.answered}
          currentAddress={account.address}
          winners={winners}
          displayName={displayName}
        />

        <Button
          onClick={() => router.push('/multiplayer')}
          variant="purple"
          className="min-h-[44px]"
        >
          Back to lobby
        </Button>
      </div>,
    );
  }

  // ── Game screen ───────────────────────────────────────────────────────────
  if (isStarted) {
    const waitingForOthers = !isParticipant || hasFinishedCards;

    return shell(
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Round {rawRoundId}</h1>
            <p className="text-sm text-gray-600">
              {getGenreDisplayName(round.genre)} ·{' '}
              {allPlayers.length} player{allPlayers.length === 1 ? '' : 's'}
            </p>
          </div>
          <p
            className="text-sm text-gray-600"
            data-testid="round-deadline"
            aria-live="polite"
          >
            {secondsLeft === null
              ? 'Round deadline pending'
              : `Round ends in ${formatTime(secondsLeft)}`}
          </p>
        </header>

        <p aria-live="polite" className="sr-only">
          {answerOutcome === 'correct'
            ? 'Correct'
            : answerOutcome === 'wrong'
              ? 'Wrong'
              : answerOutcome === 'miss'
                ? "Time's up"
                : ''}
        </p>

        {gameError && (
          <p role="alert" className="text-sm text-red-500">
            {gameError}
          </p>
        )}
        {gameEvents.error && (
          <p className="text-xs text-gray-500">
            Live scores temporarily unavailable: {gameEvents.error}
          </p>
        )}

        {isParticipant && !hasFinishedCards && (
          <section
            aria-label="Your card"
            className="flex flex-col gap-4 rounded-2xl border border-gray-200 p-4"
          >
            {isDrawing && <p className="text-gray-600">Drawing next card…</p>}

            {question && card && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    {selectedOption === null
                      ? 'Answer before the card timer runs out'
                      : 'Answer submitted'}
                  </span>
                  <span
                    className={
                      cardTimeLeft <= 3
                        ? 'font-bold text-red-600'
                        : 'font-medium text-gray-700'
                    }
                    data-testid="card-time-left"
                  >
                    {cardTimeLeft}s / {CARD_TIMEOUT_SECONDS}s
                  </span>
                </div>

                <LyricCard
                  lyrics={[
                    {
                      text: question.lyric,
                      title: '',
                      artist: '',
                    },
                  ]}
                  isFlipped={isCardFlipped}
                />

                <SongOptions
                  options={options}
                  selectedOption={selectedOption}
                  // Only reveal the answer once the card is flipped (answered
                  // or timed out); passing it earlier would highlight the
                  // correct option before the player picks.
                  correctOption={
                    isCardFlipped
                      ? null
                      : null
                  }
                  disabled={selectedOption !== null || isSubmitting}
                  onSelect={handleAnswer}
                />

                <div className="flex items-center justify-between">
                  <span
                    role="status"
                    className="text-sm font-medium"
                    data-testid="answer-outcome"
                  >
                    {isSubmitting
                      ? 'Submitting…'
                      : answerOutcome === 'correct'
                        ? 'Correct'
                        : answerOutcome === 'wrong'
                          ? 'Wrong'
                          : answerOutcome === 'miss'
                            ? "Time's up"
                            : ''}
                  </span>
                  {selectedOption !== null && !isSubmitting && (
                    <Button
                      onClick={() => void handleNextCard()}
                      variant="purple"
                      className="min-h-[44px]"
                    >
                      Next card
                    </Button>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {waitingForOthers && !isDrawing && (
          <p role="status" className="text-gray-600" data-testid="waiting-state">
            {isParticipant
              ? hasFinishedCards
                ? 'You have answered every card — waiting for other players…'
                : 'Waiting for other players…'
              : 'You are spectating this round.'}
          </p>
        )}

        <RoundScoreboard
          players={scoreboardPlayers}
          scores={mergedScores}
          answered={gameEvents.answered}
          currentAddress={account.address}
          displayName={displayName}
        />

        {deadlinePassed && (
          <section
            aria-label="Finalize round"
            className="rounded-2xl border border-gray-200 p-4"
          >
            {canFinalize ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-600">
                  The round deadline has passed. Finalize to publish the
                  results and award the pot.
                </p>
                <Button
                  onClick={() => void handleFinalize()}
                  disabled={isFinalizing}
                  variant="purple"
                  className="min-h-[44px]"
                >
                  {isFinalizing ? 'Finalizing…' : 'Finalize round'}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                {isParticipant
                  ? 'Waiting for a player or the keeper to finalize…'
                  : 'Waiting for the keeper to finalize…'}
              </p>
            )}
          </section>
        )}
      </div>,
    );
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────
  return shell(
    <>
      <div className="mx-auto mb-6 max-w-md">
        <h2 className="mb-2 text-xl font-bold">
          Players ({allPlayers.length})
        </h2>
        <ul className="space-y-1">
          {allPlayers.map((player) => (
            <li key={player} className="flex justify-between text-sm">
              <span className="mr-2 truncate" title={player}>
                {player === account.address
                  ? `${displayName(player)} (you)`
                  : displayName(player)}
              </span>
              <span
                className={
                  lobbyEvents.ready.includes(player)
                    ? 'text-green-600'
                    : 'text-gray-500'
                }
              >
                {lobbyEvents.ready.includes(player) ? 'Ready' : 'Not ready'}
              </span>
            </li>
          ))}
        </ul>
        {error && <p className="mt-4 text-red-500">{error}</p>}
        {lobbyEvents.error && (
          <p className="mt-2 text-sm text-red-500">{lobbyEvents.error}</p>
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
