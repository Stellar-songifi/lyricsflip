'use client';

import { useModalStore } from '@/store/modal-store';
import { Modal } from './modal';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { useEffect, useState } from 'react';
import { WagerDetails } from '@/store';
import { useTranslations } from 'next-intl';

interface WagerSummaryContentProps extends WagerDetails {}

export function WagerSummaryContent({
  genre,
  difficulty,
  duration,
  odds,
  wagerAmount,
  potentialWin,
}: WagerSummaryContentProps) {
  const t = useTranslations('wagerSummary');
  // Map genre to display name using the new structure
  const displayGenre = genre ? t(`genres.${genre}`) : t('unknown');

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex justify-between">
          <span className="text-gray-500">{t('genre')}</span>
          <span className="font-medium">{displayGenre}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">{t('difficulty')}</span>
          <span className="font-medium">{difficulty}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">{t('duration')}</span>
          <span className="font-medium">{duration}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">{t('odds')}</span>
          <span className="font-medium">{odds}{t('oddsUnit')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">{t('wagerAmount')}</span>
          <span className="font-medium">{wagerAmount} STRK</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">{t('potentialWin')}</span>
          <span className="font-medium text-green-500">{potentialWin}</span>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium">{t('instructions')}</h3>
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-500">
          <li>{t('instruction1')}</li>
          <li>{t('instruction2')}</li>
          <li>{t('instruction3')}</li>
        </ul>
      </div>
    </div>
  );
}

export function WagerSummaryModal() {
  const t = useTranslations('wagerSummary');
  const { isOpen, closeModal, modalType } = useModalStore();
  const { setup } = useStellar();
  const [wagerDetails, setWagerDetails] = useState<WagerDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoundDetails = async () => {
    if (!setup) {
      setError(t('setupNotInitialized'));
      return;
    }

    try {
      setIsLoading(true);
      // Placeholder: Replace with actual setup.world.actions.getRound or query
      // Example: const round = await setup.world.actions.getRound('current');
      // For now, use dummy data to simulate standalone modal
      const round = {
        genre: 'pop',
        difficulty: 'Medium',
        duration: '10 mins',
        odds: '10',
        wagerAmount: '100',
        potentialWin: '1000 STRK',
      };
      setWagerDetails(round);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedFetch'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && modalType === 'wager-summary') {
      fetchRoundDetails();
    }
  }, [isOpen, modalType, setup]);

  if (!isOpen || modalType !== 'wager-summary') return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      title={t('title')}
    >
      {isLoading ? (
        <div className="text-center">{t('loading')}</div>
      ) : error ? (
        <div className="text-red-500 text-center">{error}</div>
      ) : wagerDetails ? (
        <WagerSummaryContent {...wagerDetails} />
      ) : (
        <div className="text-center">{t('noDetails')}</div>
      )}
    </Modal>
  );
}
