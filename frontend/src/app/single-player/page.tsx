"use client";
import { SongOptions } from '@/components/molecules/song-options';
import { StatisticsPanel } from '@/components/molecules/statistics-panel';
import { LyricCard } from '@/components/organisms/lyric-card';
import BadgeModal from '@/components/organisms/new-badge-modal';
import {
  useCardTimer,
  CARD_TIMEOUT_SECONDS,
  CARD_LEDGER_LATENCY_SECONDS,
} from '@/features/game/hooks/use-card-timer';
import { fireConfetti } from '@/lib/confetti';
import { formatAmount, formatTime, WAGER_ASSET_CODE } from '@/lib/utils';
import { useStellar } from '@/lib/stellar/hooks/use-stellar';
import { getGenreDisplayName } from '@/lib/stellar/genres';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Answer,
  GENRE_VALUES,
  MILESTONES,
  MILESTONE_NAMES,
  type Genre,
  type Milestone,
  type PlayerStats,
  type QuestionCard,
  type QuestionKind,
  type Round,
} from '@/lib/stellar/types';
import { useGameTimer } from '@/features/game/hooks/use-game-timer';
import { toast } from 'sonner';
import { parseContractError, getContractErrorCode } from '@/lib/stellar/errors';
import GameResultPopup from '@/components/organisms/game-result-popup';

interface SongOption {
  title: string;
  artist: string;
}

const MILESTONE_DEFINITIONS: Array<{
  milestone: Milestone;
  isReached: (stats: PlayerStats) => boolean;
}> = [
  {
    milestone: MILESTONES.FirstWin,
    isReached: (stats) => stats.rounds_won >= BigInt(1),
  },
  {
    milestone: MILESTONES.Streak5,
    isReached: (stats) => stats.max_streak >= BigInt(5),
  },
  {
    milestone: MILESTONES.TenWins,
    isReached: (stats) => stats.rounds_won >= BigInt(10),
  },
];

/** Prompt shown above the options for each question kind. */
const QUESTION_PROMPTS: Record<QuestionKind, string> = {
  Title: 'Name the song',
  Artist: 'Name the artist',
  Year: 'Name the year',
};

/**
 * Parse a year option into a BigInt for `Answer.year`. Returns null when the
 * option isn't a valid non-negative integer so callers can guard against
 * submitting garbage to the contract.
 */
function parseYearOption(option: string): bigint | null {
  const trimmed = option.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

export default function SinglePlayerGame() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roundIdParam = searchParams?.get('roundId') ?? null;
  const genreParam = searchParams?.get('genre') ?? null;
  const { account, systemCalls } = useStellar();

  const [round, setRound] = useState<Round | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roundId, setRoundId] = useState<bigint | null>(
    roundIdParam ? BigInt(roundIdParam) : null,
  );
  // Only the question (lyric + options) is ever held here, never the card:
  // the answer stays on-chain until `answer_and_next` reveals it (LF-297).
  const [card, setCard] = useState<QuestionCard | null>(null);
  const [question, setQuestion] = useState<QuestionCard | null>(null);
  const [nextQuestion, setNextQuestion] = useState<QuestionCard | null>(null);
  const questionKind: QuestionKind = question?.kind ?? 'Title';
  const [totalCards, setTotalCards] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<SongOption | null>(null);
  const [correctOption, setCorrectOption] = useState<SongOption | null>(null);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [score, setScore] = useState(0);
  // Ledger close time (unix ms) that opened the current card's answer window.
  const [cardStartedAtMs, setCardStartedAtMs] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastPoints, setLastPoints] = useState(0);
  const [answerResult, setAnswerResult] = useState<
    'correct' | 'wrong' | 'late' | null
  >(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isRoundFinalized, setIsRoundFinalized] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);

  // Exactly one round timer: it derives the remaining time from the round's
  // on-chain `end_time`, so a page refresh resumes with the correct value
  // instead of restarting the countdown.
  const { timeLeft } = useGameTimer({
    endTimeSeconds: round ? round.end_time : null,
  });

  // Badge modal state (Issue #476 / LF-191)
  const [earnedBadgeQueue, setEarnedBadgeQueue] = useState<string[]>([]);
  const isBadgeModalOpen = earnedBadgeQueue.length > 0;
  const currentBadgeName = earnedBadgeQueue[0] ?? '';

  const handleCloseBadgeModal = useCallback(() => {
    setEarnedBadgeQueue((prev) => prev.slice(1));
  }, []);
  const statusRef = useRef<HTMLParagraphElement>(null);
  // Guards against creating two solo rounds when effects run twice.
  const hasStartedRef = useRef(false);
  // Ledger close time that opened the answer window of `nextQuestion`.
  const nextStartedAtMsRef = useRef<number | null>(null);

  // ── Per-card 15-second timer (Issue #472) ────────────────────────────────
  /**
   * The card timer is active while:
   *   - a card is loaded
   *   - no answer has been selected yet
   *   - the card isn't already flipped
   */
  const cardTimerActive =
    isGameStarted &&
    question !== null &&
    selectedOption === null &&
    !isCardFlipped &&
    !isSubmitting;

  const handleCardTimeout = useCallback(() => {
    // Time ran out – flip the card and count it as a miss. The answer is only
    // revealed by the contract, so nothing is highlighted here.
    // Time ran out – flip the card to reveal the answer and count as a miss
    setCorrectOption(null);
    setIsCardFlipped(true);
    setAnswerResult('late');
  }, []);

  const {
    timeLeft: cardTimeLeft,
    isExpired: isCardWindowClosed,
    reset: resetCardTimer,
  } = useCardTimer({
    isActive: cardTimerActive,
    onTimeout: handleCardTimeout,
    // Anchor the countdown to the ledger that included `next_card` instead of
    // the moment this component rendered (LF-193).
    startedAtMs: cardStartedAtMs,
  });

  // ── Contract data fetching ────────────────────────────────────────────────
  const showQuestion = useCallback(
    (next: QuestionCard, startedAtMs: number | null) => {
      setSelectedOption(null);
      setCorrectOption(null);
      setAnswerResult(null);
      setIsCardFlipped(false);
      resetCardTimer();
      setQuestion(next);
      setNextQuestion(null);
      // The contract's window opened when the drawing transaction closed in a
      // ledger, which is several seconds before this line runs (LF-193).
      setCardStartedAtMs(startedAtMs);
    },
    [resetCardTimer],
  );
  const loadNextCard = useCallback(async () => {
    if (!systemCalls || !roundId) return;
    const id = BigInt(roundId);
    setSelectedOption(null);
    setCorrectOption(null);
    setAnswerResult(null);
    setIsCardFlipped(false);
    setCardStartedAtMs(null);
    resetCardTimer();
    setTxStatus('Drawing next card…');
    const { result: nextCard, startedAtMs } = await systemCalls.nextCardWithMeta(id);
    setQuestionKind(nextCard.kind);
    setCard(nextCard);
    setQuestion(nextCard);
    // The contract's 15 s window started when `next_card` closed in a ledger,
    // which is several seconds before this line runs.
    setCardStartedAtMs(startedAtMs);
    setTxStatus(null);
  }, [answeredCount, kindSetting, roundId, systemCalls, resetCardTimer]);

  useEffect(() => {
    const fetchRoundData = async () => {
      if (!systemCalls) {
        setError('System calls not initialized');
        return;
      }
      if (hasStartedRef.current) return;
      if (
        roundId === null &&
        !GENRE_VALUES.includes(genreParam as Genre)
      ) {
        setIsLoading(false);
        return;
      }
      hasStartedRef.current = true;
      try {
        const total = await systemCalls.getCardsPerRound();
        setTotalCards(total);
        if (roundId === null) {
          // New solo round: one signature creates, starts and draws card one.
          setTxStatus('Starting round…');
          const solo = await systemCalls.createSoloRound(genreParam as Genre);
          setRoundId(solo.roundId);
          setRound(await systemCalls.getRound(solo.roundId));
          setAnsweredCount(0);
          setIsGameStarted(true);
          showQuestion(solo.question, solo.startedAtMs);
        } else {
          // Resuming: read the current question without signing.
          const roundData = await systemCalls.getRound(roundId);
          setRound(roundData);
          setIsGameStarted(true);
          const current = await systemCalls.getQuestion(roundId);
          setAnsweredCount(Math.max(0, roundData.next_card_index - 1));
          showQuestion(current, null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get round data');
      } finally {
        setTxStatus(null);
        setIsLoading(false);
      }
    };
    fetchRoundData();
    // Runs once per page load; `roundId` is set by this effect itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemCalls]);

  // ── Milestone / badge check (Issue #677 / LF-191) ─────────────────────────
  const checkMilestoneAndShowBadge = useCallback(
    async (finalScore: number, total: number) => {
      if (!systemCalls || !account?.address) return;
      try {
        const stats = await systemCalls.getPlayerStat(account.address);
        const newlyEarnedBadges: string[] = [];

        for (const def of MILESTONE_DEFINITIONS) {
          if (!def.isReached(stats)) continue;

          try {
            const alreadyClaimed = await systemCalls.isMilestoneClaimed(
              account.address,
              def.milestone,
            );
            if (alreadyClaimed) continue;

            await systemCalls.claimReward(def.milestone);
            newlyEarnedBadges.push(MILESTONE_NAMES[def.milestone]);
          } catch (err) {
            toast.error(parseContractError(err).message);
          }
        }

        if (newlyEarnedBadges.length > 0) {
          setEarnedBadgeQueue((prev) => [...prev, ...newlyEarnedBadges]);
        }
      } catch (err) {
        console.warn('Failed to check player milestones:', err);
      }
    },
    [account?.address, systemCalls],
  );

  // ── Game options ──────────────────────────────────────────────────────────
  // The contract returns every option as a string, including years, so we keep
  // them as-is and only convert to BigInt at submit time.
  const options: SongOption[] = question
    ? [
        question.option_one,
        question.option_two,
        question.option_three,
        question.option_four,
      ].map((option) => ({ title: option, artist: '' }))
    : [];

  const isRoundFinished = totalCards > 0 && answeredCount >= totalCards;

  // ── Answer handling ───────────────────────────────────────────────────────
  /** Signs one `answer_and_next`: scores this card and draws the next. */
  const submitAnswer = useCallback(
    async (answer: Answer, option: SongOption | null) => {
      if (!systemCalls || roundId === null) return;
  const handleAnswer = useCallback(
    async (option: SongOption) => {
      if (!systemCalls || !roundId || !card || selectedOption !== null) return;
      setSelectedOption(option);
      setIsCardFlipped(true);
      setCorrectOption(null);
      setAnswerResult(null);

      // Build the Answer variant that matches the question kind. Year options
      // arrive as strings, so parse them safely before hitting the contract.
      let answer: Answer;
      if (questionKind === 'Artist') {
        answer = Answer.artist(option.title);
      } else if (questionKind === 'Year') {
        const year = parseYearOption(option.title);
        if (year === null) {
          setError(`Invalid year option: ${option.title}`);
          return;
        }
        answer = Answer.year(year);
      } else {
        answer = Answer.title(option.title);
      }

      try {
        // Show "Submitting…" until the transaction is included in a ledger;
        // the contract, not the client clock, decides whether it was in time.
        setIsSubmitting(true);
        setTxStatus('Submitting answer…');
        const res = await systemCalls.answerAndNext(roundId, answer);
        // A wrong answer and a late one both score false; the ledger close
        // time of the submission tells them apart (LF-193).
        const windowClosesAtMs =
          cardStartedAtMs === null
            ? null
            : cardStartedAtMs + CARD_TIMEOUT_SECONDS * 1000;
        const wasLate =
          !res.result &&
          (option === null ||
            (res.closedAtMs !== null &&
              windowClosesAtMs !== null &&
              res.closedAtMs > windowClosesAtMs));
        if (res.correctOption >= 1 && res.correctOption <= options.length) {
          setCorrectOption(options[res.correctOption - 1]);
        } else if (res.result && option) {
          setCorrectOption(option);
        }
        if (res.result) {
          setScore((prev) => prev + 1);
          fireConfetti();
        }
        setLastPoints(res.points);
        setAnswerResult(res.result ? 'correct' : wasLate ? 'late' : 'wrong');
        setAnsweredCount((prev) => prev + 1);
        setNextQuestion(res.next);
        nextStartedAtMsRef.current = res.closedAtMs;
        setTxStatus(null);
        return res;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit answer');
        setTxStatus(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cardStartedAtMs, question, roundId, systemCalls],
  );

  const handleAnswer = useCallback(
    async (option: SongOption) => {
      if (!question || selectedOption !== null) return;
      setSelectedOption(option);
      setIsCardFlipped(true);
      setAnswerResult(null);

      // Build the Answer variant that matches the question kind. Year options
      // arrive as strings, so parse them safely before hitting the contract.
      let answer: Answer;
      if (questionKind === 'Artist') {
        answer = Answer.artist(option.title);
      } else if (questionKind === 'Year') {
        const year = parseYearOption(option.title);
        if (year === null) {
          setError(`Invalid year option: ${option.title}`);
          return;
        }
        answer = Answer.year(year);
      } else {
        answer = Answer.title(option.title);
      }
      await submitAnswer(answer, option);
    },
    [question, questionKind, selectedOption, submitAnswer],
  );

  const finalizeAndShowResults = useCallback(async () => {
    if (!systemCalls || !roundId || isFinalizing || isRoundFinalized) return;
    const id = BigInt(roundId);
    setIsFinalizing(true);
    setTxStatus('Finalizing round…');

    try {
      await systemCalls.finalizeRound(id);
    } catch (err) {
      const code = getContractErrorCode(err);
      if (code !== 19) {
        console.warn('Finalize round non-fatal error:', err);
      }
    }

    setIsRoundFinalized(true);

    // Fetch authoritative score from contract
    let authoritativeScore = score;
    try {
      const scores = await systemCalls.getRoundScores(id);
      if (account?.address && scores[account.address] !== undefined) {
        authoritativeScore = scores[account.address];
        setScore(authoritativeScore);
      } else if (round?.admin && scores[round.admin] !== undefined) {
        authoritativeScore = scores[round.admin];
        setScore(authoritativeScore);
      }
    } catch (err) {
      console.warn('Failed to fetch authoritative round scores:', err);
    }

    setTxStatus(null);
    setIsFinalizing(false);
    setShowResultModal(true);

    await checkMilestoneAndShowBadge(authoritativeScore, totalCards);
  }, [
    account?.address,
    checkMilestoneAndShowBadge,
    isFinalizing,
    isRoundFinalized,
    round?.admin,
    roundId,
    score,
    systemCalls,
    totalCards,
  ]);

  const handleNextCard = useCallback(async () => {
    let next = nextQuestion;
    let finished = isRoundFinished;
    if (selectedOption === null) {
      // The card timed out unanswered: an empty answer scores it as missed
      // and draws the next card in the same signature.
      const res = await submitAnswer(Answer.title(''), null);
      if (!res) return;
      next = res.next;
      finished = res.next === null;
    }
    if (finished || !next) {
      await finalizeAndShowResults();
      return;
    }
    showQuestion(next, nextStartedAtMsRef.current);
  }, [
    finalizeAndShowResults,
    isRoundFinished,
    nextQuestion,
    selectedOption,
    showQuestion,
    submitAnswer,
  ]);

  useEffect(() => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const hasDeadlineElapsed =
      round !== null &&
      round.end_time > BigInt(0) &&
      timeLeft === 0 &&
      BigInt(nowSeconds) >= round.end_time;

    if (
      isGameStarted &&
      hasDeadlineElapsed &&
      !isRoundFinalized &&
      !isFinalizing &&
      !isSubmitting
    ) {
      finalizeAndShowResults();
    }
  }, [
    isGameStarted,
    round,
    timeLeft,
    isRoundFinalized,
    isFinalizing,
    isSubmitting,
    finalizeAndShowResults,
  ]);

  // ── Screen-reader status updates ──────────────────────────────────────────
  useEffect(() => {
    if (statusRef.current) {
      statusRef.current.textContent = txStatus ?? '';
    }
  }, [txStatus]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p>Loading round…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p role="alert" className="text-red-500">
          {error}
        </p>
        <button onClick={() => router.back()} className="underline">
          Go back
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <p className="text-sm text-gray-500">
          {round ? getGenreDisplayName(round.genre) : ''}
        </p>
      </header>

      <p ref={statusRef} aria-live="polite" className="sr-only" />

      <StatisticsPanel
        time={formatTime(timeLeft)}
        potWin={`${formatAmount(round?.wager_amount ?? 0)} ${WAGER_ASSET_CODE}`}
        scores={`${score} / ${totalCards}`}
      />

      {question && (
        <section className="flex flex-col gap-4">
          <LyricCard
            lyrics={[
              {
                text: question.lyric,
                title: correctOption?.title ?? '',
                artist: correctOption?.artist ?? '',
                      title: '',
                      artist: '',
              },
            ]}
            isFlipped={isCardFlipped}
          />

          <p className="text-sm font-semibold text-gray-900">
            {QUESTION_PROMPTS[questionKind]}
          </p>

          <p className="text-xs text-gray-500">
            Answers close {CARD_LEDGER_LATENCY_SECONDS}s early to cover one
            ledger of submission latency.
          </p>

          {isSubmitting && (
            <p role="status" className="text-sm font-medium text-purple-600">
              Submitting…
            </p>
          )}

          {answerResult && !isSubmitting && (
            <p
              role="status"
              className={
                answerResult === 'correct'
                  ? 'text-sm font-semibold text-green-600'
                  : 'text-sm font-semibold text-red-600'
              }
            >
              {answerResult === 'correct'
                ? `Correct · +${lastPoints} pts`
                : answerResult === 'late'
                  ? 'Too late'
                  : 'Wrong'}
            </p>
          )}

          <SongOptions
            options={options}
            selectedOption={selectedOption}
            correctOption={correctOption}
            disabled={
              selectedOption !== null ||
              isSubmitting ||
              isCardWindowClosed ||
              isCardFlipped
            }
            onSelect={handleAnswer}
          />

          {(selectedOption !== null || isCardFlipped) && !isSubmitting && (
            <button
              onClick={handleNextCard}
              className="self-end rounded bg-black px-4 py-2 text-white"
            >
              Next card
            </button>
          )}
        </section>
      )}

      {txStatus && <p className="text-sm text-gray-500">{txStatus}</p>}

      <BadgeModal
        isOpen={isBadgeModalOpen}
        badgeName={currentBadgeName}
        onClose={handleCloseBadgeModal}
      />

      {showResultModal && (
        <GameResultPopup
          isWin={score > 0}
          isMultiplayer={false}
        />
      )}
    </main>
  );
}
