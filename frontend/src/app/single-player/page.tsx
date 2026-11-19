"use client";
import { SongOptions } from '@/components/molecules/song-options';
import { StatisticsPanel } from '@/components/molecules/statistics-panel';
import { Confetti } from '@/components/molecules/confetti';
import { LyricCard } from '@/components/organisms/LyricCard';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Answer, type Card, type QuestionCard, type Round } from '@/lib/stellar/types';
import { useTranslations } from 'next-intl';

interface SongOption {
  title: string;
  artist: string;
}

export default function SinglePlayerGame() {
  const t = useTranslations('singlePlayer');
  const router = useRouter();
  const searchParams = useSearchParams();
  const roundId = searchParams.get('roundId');
  const { systemCalls } = useStellar();
  const [round, setRound] = useState<Round | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [question, setQuestion] = useState<QuestionCard | null>(null);
  const [totalCards, setTotalCards] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<SongOption | null>(null);
  const [correctOption, setCorrectOption] = useState<SongOption | null>(null);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes default
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [resultAnnouncement, setResultAnnouncement] = useState<string | null>(null);

  const loadNextCard = useCallback(async () => {
    if (!systemCalls || !roundId) return;
    const id = BigInt(roundId);
    setSelectedOption(null);
    setCorrectOption(null);
    setIsCardFlipped(false);
    setLastAnswerCorrect(null);
    setResultAnnouncement(null);
    setTxStatus(t('drawingCard'));
    const nextCard = await systemCalls.nextCard(id);
    setTxStatus(t('buildingQuestion'));
    const questionCard = await systemCalls.buildQuestionCard(nextCard, 'Title');
    setCard(nextCard);
    setQuestion(questionCard);
    setTxStatus(null);
  }, [roundId, systemCalls, t]);

  useEffect(() => {
    const fetchRoundData = async () => {
      if (!systemCalls) {
        setError(t('noSystemCalls'));
        return;
      }

      if (!roundId) {
        setIsLoading(false);
        return;
      }

      try {
        const id = BigInt(roundId);
        let roundData = await systemCalls.getRound(id);
        if (!roundData.is_started) {
          // Single-player rounds start as soon as the creator is ready.
          setTxStatus(t('startingRound'));
          await systemCalls.startRound(id);
          roundData = await systemCalls.getRound(id);
        }
        const cards = await systemCalls.getRoundCards(id);
        setRound(roundData);
        setTotalCards(cards.length);
        setAnsweredCount(roundData.next_card_index);
        setIsGameStarted(true);
        if (roundData.next_card_index < cards.length) {
          await loadNextCard();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('failedFetch'));
      } finally {
        setTxStatus(null);
        setIsLoading(false);
      }
    };

    fetchRoundData();
  }, [roundId, systemCalls, loadNextCard, t]);

  useEffect(() => {
    if (isGameStarted && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isGameStarted, timeLeft]);

  const options: SongOption[] = question
    ? [question.option_one, question.option_two, question.option_three, question.option_four].map(
        (title) => ({ title, artist: '' }),
      )
    : [];
  const isRoundFinished = totalCards > 0 && answeredCount >= totalCards;

  const handleSongSelect = async (option: SongOption) => {
    if (!round || !card || !systemCalls || selectedOption) return;

    setSelectedOption(option);
    try {
      setTxStatus(t('submittingAnswer'));
      const isCorrect = await systemCalls.submitAnswer(round.round_id, Answer.title(option.title));
      setCorrectOption(isCorrect ? option : { title: card.title, artist: card.artist });
      setLastAnswerCorrect(isCorrect);
      setResultAnnouncement(
        isCorrect
          ? t('correct')
          : t('wrong', { title: card.title, artist: card.artist }),
      );
      if (isCorrect) {
        setScore(prev => prev + 1);
      }
      setAnsweredCount(prev => prev + 1);
      setIsCardFlipped(true);
    } catch (err) {
      setSelectedOption(null);
      setError(err instanceof Error ? err.message : t('failedSubmit'));
    } finally {
      setTxStatus(null);
    }
  };

  const handleNextCard = async () => {
    try {
      await loadNextCard();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedNextCard'));
      setTxStatus(null);
    }
  };

  const handleBack = () => {
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="container mt-4 mx-auto h-fit w-full mb-20 lg:mb-12 p-4 lg:p-0 md:mt-24 lg:mt-32">
        <p>{txStatus || t('loading')}</p>
      </div>
    );
  }

  if (error || !round) {
    return (
      <div className="container mt-4 mx-auto h-fit w-full mb-20 lg:mb-12 p-4 lg:p-0 md:mt-24 lg:mt-32">
        <p>{error || t('noRound')}</p>
        <button
          onClick={handleBack}
          className="mt-4 px-4 py-2 bg-purple-500 text-white rounded"
        >
          {t('returnHome')}
        </button>
      </div>
    );
  }

  return (
    <div className="container mt-4 mx-auto h-fit w-full mb-20 lg:mb-12 p-4 lg:p-0 md:mt-24 lg:mt-32">
      {isCardFlipped && lastAnswerCorrect && <Confetti />}
      <div className="mb-6">
        <button
          onClick={handleBack}
          className="flex items-center text-gray-600 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('back')}
        </button>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-gray-600 text-sm">
          {`${round.genre.toString()} | ${t('genreHeader')}`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-start-2 lg:col-span-1 order-1 lg:order-2">
          <LyricCard
            lyrics={[
              {
                text: question?.lyric || t('loading'),
                title: card?.title || '',
                artist: card?.artist || '',
              }
            ]}
            isFlipped={isCardFlipped}
          />
        </div>
        <div className="lg:col-start-3 lg:col-span-1 order-2 lg:order-3">
          <StatisticsPanel
            time={`${timeLeft}`}
            potWin={`${round.wager_amount.toString()} STRK`}
            scores={`${score} / ${totalCards}`}
          />
        </div>
      </div>

      {txStatus && <p className="mt-4 text-sm text-gray-600">{txStatus}</p>}

      <SongOptions
        options={options}
        onSelect={handleSongSelect}
        selectedOption={selectedOption}
        correctOption={correctOption}
        groupLabel={t('optionsLabel')}
        resultAnnouncement={resultAnnouncement}
      />

      {isCardFlipped && (
        <div className="mt-6 flex justify-center">
          {isRoundFinished ? (
            <p className="font-semibold">
              {t('roundComplete', { score, total: totalCards })}
            </p>
          ) : (
            <button
              onClick={handleNextCard}
              disabled={!!txStatus}
              className="px-4 py-2 bg-purple-500 text-white rounded disabled:opacity-50"
            >
              {t('nextCard')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
