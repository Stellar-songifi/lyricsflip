'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/atoms/select';
import { useModalStore } from '@/store/modal-store';
import { useEffect, useState } from 'react';
import { Input } from '../atoms/input';
import { Modal } from './modal';
import { WagerSummaryContent } from './WagerSummaryModal';
import { WagerDetails, useStore } from '@/store';
import { useRouter } from 'next/navigation';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import type { Genre } from '@/lib/stellar/types';
import { useTranslations } from 'next-intl';

// Map form genre values to contract Genre enum variants (display labels live
// in messages and are rendered via `t('genres.<value>')`).
export const GENRE_MAPPING: Record<string, { variant: Genre }> = {
  pop: { variant: 'Pop' },
  rock: { variant: 'Rock' },
  hiphop: { variant: 'HipHop' },
  rnb: { variant: 'RnB' },
};

export type GenreKey = keyof typeof GENRE_MAPPING;

export function WagerModal() {
  const t = useTranslations('wagerModal');
  const router = useRouter();
  const { isOpen, closeModal, modalType } = useModalStore();
  const [stage, setStage] = useState<'form' | 'summary'>('form');
  const [wagerDetails, setWagerDetails] = useState<WagerDetails>({
    genre: '',
    difficulty: '',
    duration: '',
    odds: '',
    wagerAmount: '',
    potentialWin: '',
  });
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const startGame = useStore((state) => state.game.startGame);
  const isModalOpen = isOpen && modalType === 'wager';

  const { setup, account } = useStellar();

  useEffect(() => {
    const oddsValue = parseFloat(wagerDetails.odds);
    const wagerValue = parseFloat(wagerDetails.wagerAmount);

    if (!isNaN(oddsValue) && !isNaN(wagerValue)) {
      const calculatedWin = wagerValue * oddsValue;
      setWagerDetails((prev) => ({
        ...prev,
        potentialWin: `${isNaN(calculatedWin) ? 0 : calculatedWin} STRK`,
      }));
    }
  }, [wagerDetails.odds, wagerDetails.wagerAmount]);

  const validateForm = () => {
    const errors: { [key: string]: string } = {};

    if (!wagerDetails.genre) errors.genre = t('required.genre');
    else if (!GENRE_MAPPING[wagerDetails.genre as keyof typeof GENRE_MAPPING]) {
      errors.genre = t('required.invalidGenre');
    }
    if (!wagerDetails.difficulty) errors.difficulty = t('required.difficulty');
    if (!wagerDetails.duration) errors.duration = t('required.duration');
    if (!wagerDetails.odds) errors.odds = t('required.odds');
    if (!wagerDetails.wagerAmount) errors.wagerAmount = t('required.wagerAmount');

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProceedToSummary = () => {
    if (validateForm()) {
      setStage('summary');
      setFormErrors({});
    }
  };

  const handleStartGame = async () => {
    setSubmissionError(null);
    try {
      if (!account) {
        setSubmissionError(t('errors.account'));
        return;
      }

      if (!setup?.systemCalls) {
        setSubmissionError(t('errors.system'));
        return;
      }

      const genreKey = wagerDetails.genre as GenreKey;
      const genreInfo = GENRE_MAPPING[genreKey];

      if (!genreInfo) {
        setSubmissionError(t('errors.invalidGenre'));
        return;
      }

      try {
        const result = await setup.systemCalls.createRound(genreInfo.variant);

        startGame({
          genre: wagerDetails.genre,
          difficulty: wagerDetails.difficulty,
          duration: wagerDetails.duration,
          odds: parseFloat(wagerDetails.odds),
          wagerAmount: parseFloat(wagerDetails.wagerAmount),
        });

        closeModal();
        router.push(`/single-player?roundId=${result}`);
        setWagerDetails({
          genre: '',
          difficulty: '',
          duration: '',
          odds: '',
          wagerAmount: '',
          potentialWin: '',
        });
        setStage('form');
      } catch (err) {
        console.error('Error creating round:', err);
        setSubmissionError(t('errors.createRound'));
      }
    } catch (err) {
      console.error('Error creating round:', err);
      setSubmissionError(t('errors.createRound'));
    }
  };

  const renderWagerForm = () => (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <label htmlFor="genre" className="text-sm font-medium">
          {t('genre')}
        </label>
        <Select
          value={wagerDetails.genre}
          onValueChange={(value) =>
            setWagerDetails((prev) => ({ ...prev, genre: value }))
          }
        >
          <SelectTrigger className={formErrors.genre ? 'border-red-500' : ''}>
            <SelectValue placeholder={t('selectGenre')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pop">{t('genres.pop')}</SelectItem>
            <SelectItem value="rock">{t('genres.rock')}</SelectItem>
            <SelectItem value="hiphop">{t('genres.hiphop')}</SelectItem>
            <SelectItem value="rnb">{t('genres.rnb')}</SelectItem>
          </SelectContent>
        </Select>
        {formErrors.genre && (
          <p className="text-red-500 text-xs">{formErrors.genre}</p>
        )}
      </div>

      <div className="grid gap-2">
        <label htmlFor="difficulty" className="text-sm font-medium">
          {t('difficulty')}
        </label>
        <Select
          value={wagerDetails.difficulty}
          onValueChange={(value) =>
            setWagerDetails((prev) => ({ ...prev, difficulty: value }))
          }
        >
          <SelectTrigger
            className={formErrors.difficulty ? 'border-red-500' : ''}
          >
            <SelectValue placeholder={t('selectDifficulty')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="easy">{t('difficulties.easy')}</SelectItem>
            <SelectItem value="medium">{t('difficulties.medium')}</SelectItem>
            <SelectItem value="hard">{t('difficulties.hard')}</SelectItem>
          </SelectContent>
        </Select>
        {formErrors.difficulty && (
          <p className="text-red-500 text-xs">{formErrors.difficulty}</p>
        )}
      </div>

      <div className="grid gap-2">
        <label htmlFor="duration" className="text-sm font-medium">
          {t('duration')}
        </label>
        <Select
          value={wagerDetails.duration}
          onValueChange={(value) =>
            setWagerDetails((prev) => ({ ...prev, duration: value }))
          }
        >
          <SelectTrigger
            className={formErrors.duration ? 'border-red-500' : ''}
          >
            <SelectValue placeholder={t('selectDuration')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5min">{t('durations.5min')}</SelectItem>
            <SelectItem value="10min">{t('durations.10min')}</SelectItem>
            <SelectItem value="15min">{t('durations.15min')}</SelectItem>
          </SelectContent>
        </Select>
        {formErrors.duration && (
          <p className="text-red-500 text-xs">{formErrors.duration}</p>
        )}
      </div>

      <div className="grid gap-2">
        <label htmlFor="odds" className="text-sm font-medium">
          {t('odds')}
        </label>
        <Select
          value={wagerDetails.odds}
          onValueChange={(value) =>
            setWagerDetails((prev) => ({ ...prev, odds: value }))
          }
        >
          <SelectTrigger className={formErrors.odds ? 'border-red-500' : ''}>
            <SelectValue placeholder={t('selectOdds')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">{t('oddsOptions.5')}</SelectItem>
            <SelectItem value="10">{t('oddsOptions.10')}</SelectItem>
            <SelectItem value="15">{t('oddsOptions.15')}</SelectItem>
          </SelectContent>
        </Select>
        {formErrors.odds && (
          <p className="text-red-500 text-xs">{formErrors.odds}</p>
        )}
      </div>

      <div className="bg-[#F0F0F0] p-4 rounded-lg flex flex-col gap-3">
        <p className="text-xs font-medium">
          {t('walletBalance')}{' '}
          <span className="text-[#9747FF]">{t('walletBalanceValue')}</span>
        </p>
        <div className="text-sm flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="your-wager">
            {t('yourWager')}
          </label>
          <div className="flex bg-white focus-within:outline-none focus-within:ring-1 focus-within:ring-ring disabled:cursor-not-allowed disabled:opacity-50 p-3 rounded-[4px]">
            <Input
              type="number"
              name="your-wager"
              id="your-wager"
              value={wagerDetails.wagerAmount}
              onChange={(e) =>
                setWagerDetails((prev) => ({
                  ...prev,
                  wagerAmount: e.target.value,
                }))
              }
              className={`border-none shadow-none focus-visible:ring-0 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${formErrors.wagerAmount ? 'border-red-500' : ''}`}
              placeholder={t('enterAmount')}
            />
            <Select value={'STRK'}>
              <SelectTrigger className="rounded-full w-full max-w-[66px] border-[#DBE2E8] text-[10px] font-light">
                <SelectValue placeholder={t('selectCurrency')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STRK">STRK</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {formErrors.wagerAmount && (
            <p className="text-red-500 text-xs">{formErrors.wagerAmount}</p>
          )}
        </div>
        <div className="text-sm flex flex-col gap-2">
          <label className="text-sm font-medium">{t('youWin')}</label>
          <Input
            disabled
            value={wagerDetails.potentialWin}
            className="p-4 shadow-none rounded-[4px] bg-[#F5F6F8] border-[#DBE2E8] h-auto"
          />
        </div>
      </div>
      {submissionError && (
        <p className="text-red-500 text-sm mt-2">{submissionError}</p>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={closeModal}
      title={stage === 'form' ? t('title') : t('summaryTitle')}
      description={
        stage === 'form' ? t('description') : undefined
      }
      primaryActionLabel={
        stage === 'form' ? t('proceedToSummary') : t('startGame')
      }
      onPrimaryAction={
        stage === 'form' ? handleProceedToSummary : handleStartGame
      }
    >
      {stage === 'form' ? (
        renderWagerForm()
      ) : (
        <WagerSummaryContent {...wagerDetails} />
      )}
    </Modal>
  );
}
