'use client';

import { useModalStore } from '@/store/modal-store';
import { Modal } from './modal';
import { Button } from '@/components/atoms/button';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { useEffect, useState } from 'react';
import { GENRE_MAPPING, GenreKey } from './WagerModal';
import { WagerDetails } from '@/store';
import { WAGER_ASSET_CODE } from '@/lib/utils';

interface WagerSummaryContentProps extends WagerDetails {}

export function WagerSummaryContent({
  genre,
  difficulty,
  duration,
  odds,
  wagerAmount,
  potentialWin,
}: WagerSummaryContentProps) {
  // Map genre to display name using the new structure
  const displayGenre = genre ? GENRE_MAPPING[genre as GenreKey]?.display || genre : 'Unknown';

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex justify-between">
          <span className="text-gray-500">Genre:</span>
          <span className="font-medium">{displayGenre}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Difficulty:</span>
          <span className="font-medium">{difficulty}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Duration:</span>
          <span className="font-medium">{duration}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Odds:</span>
          <span className="font-medium">{odds}x</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Wager Amount:</span>
          <span className="font-medium">{wagerAmount} {WAGER_ASSET_CODE}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Potential Win:</span>
          <span className="font-medium text-green-500">{potentialWin}</span>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium">Instructions:</h3>
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-500">
          <li>Complete the round within the specified duration</li>
          <li>Score points by correctly identifying lyrics</li>
          <li>Your winnings will be calculated based on your score and the odds</li>
        </ul>
      </div>
    </div>
  );
}

export function WagerSummaryModal() {
  const { isOpen, closeModal, modalType } = useModalStore();
  const { setup } = useStellar();
  const [wagerDetails, setWagerDetails] = useState<WagerDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoundDetails = async () => {
    if (!setup) {
      setError('Stellar setup not initialized');
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
        potentialWin: `1000 ${WAGER_ASSET_CODE}`,
      };
      setWagerDetails(round);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get round details');
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
      title="Wager Summary"
    >
      {isLoading ? (
        <div className="text-center">Loading round details...</div>
      ) : error ? (
        <div className="text-red-500 text-center">{error}</div>
      ) : wagerDetails ? (
        <WagerSummaryContent {...wagerDetails} />
      ) : (
        <div className="text-center">No round details available</div>
      )}
    </Modal>
  );
}