'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { FaCircleCheck } from 'react-icons/fa6';
import { MdCancel } from 'react-icons/md';
import { Button } from '@/components/atoms/button';
import { Modal } from './modal';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { WAGER_ASSET_CODE } from '@/lib/utils';

interface GameResultPopupProps {
  isWin: boolean;
  isMultiplayer: boolean;
}

const GameResultPopup: React.FC<GameResultPopupProps> = ({
  isWin,
  isMultiplayer,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { systemCalls } = useStellar();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roundData, setRoundData] = useState<any>(null);

  const roundId = searchParams.get('roundId');

  useEffect(() => {
    const fetchRoundData = async () => {
      if (!systemCalls) {
        setError('System calls not initialized');
        return;
      }

      if (!roundId) return;

      try {
        setIsLoading(true);
        const data = await systemCalls.getRound(BigInt(roundId));
        setRoundData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get round data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoundData();
  }, [roundId, systemCalls]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    router.push('/');
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Check out my game result!',
        text: `I scored ${roundData?.score || 0} points in LyricsFlip!`,
        url: window.location.href,
      }).catch((err) => console.warn('Error sharing:', err));
    } else {
      navigator.clipboard.writeText(window.location.href)
        .then(() => alert('Link copied to clipboard!'))
        .catch((err) => console.error('Failed to copy:', err));
    }
  };

  const handleClaimEarnings = async () => {
    if (!systemCalls) {
      setError('System calls not initialized');
      return;
    }

    if (!roundId) return;

    try {
      setIsLoading(true);
      await systemCalls.claimEarnings();
      alert('Earnings claimed successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim earnings');
    } finally {
      setIsLoading(false);
    }
  };

  const renderResultContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-64">
          <p className="text-[24px] font-[600]">Loading...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex justify-center items-center h-64">
          <p className="text-[24px] font-[600] text-red-500">{error}</p>
        </div>
      );
    }

    if (!roundData) {
      return (
        <div className="flex justify-center items-center h-64">
          <p className="text-[24px] font-[600]">No round data available</p>
        </div>
      );
    }

    const score = roundData.score || 0;
    const maxRounds = roundData.maxRounds || 0;
    const percent = (score / maxRounds) * 100;

    return (
      <div className="space-y-4 mt-10">
        <div className="flex flex-col justify-center items-center gap-6">
          <div className="size-[200px]">
            <Image
              src={isWin ? '/trophy.png' : '/warning.png'}
              alt={isWin ? 'trophy' : 'lost'}
              width={200}
              height={200}
              className="w-full h-full"
            />
          </div>
          <p className="font-bold text-[32px]">
            <span className="text-[#70E3C7]">{score} Points</span> -{' '}
            {isWin && isMultiplayer ? (
              <span>You won🥇</span>
            ) : isWin ? (
              <span>You are amazing🔥</span>
            ) : (
              <span>You lost😞</span>
            )}
          </p>
        </div>

        {!isMultiplayer ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">Score</span>
              <span className="font-medium">
                {`${score} / ${maxRounds}`} ({percent.toFixed()}%)
              </span>
            </div>
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">Odds</span>
              <span className="font-medium flex items-center gap-2">
                {roundData.odds} odds (Get everything right){' '}
                <span>
                  {isWin ? (
                    <FaCircleCheck className="text-green-600 size-5" />
                  ) : (
                    <MdCancel className="text-red-600 size-5" />
                  )}
                </span>
              </span>
            </div>
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">Wager Amount</span>
              <span className="font-medium">
                {roundData.wagerAmount} {WAGER_ASSET_CODE}
              </span>
            </div>
            {isWin && (
              <div className="flex justify-between items-center border-b py-[12px]">
                <span className="text-gray-600">You Win</span>
                <span className="font-medium text-[#9747FF]">
                  {roundData.potentialWin} {WAGER_ASSET_CODE}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">Winner</span>
              <span className="font-medium">
                {isWin ? 'You' : roundData.winner}
              </span>
            </div>
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">Prize Won</span>
              <span className="font-medium text-[#9747FF]">
                {roundData.prize} {WAGER_ASSET_CODE}
              </span>
            </div>
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">Wager Amount</span>
              <span className="font-medium">{roundData.wagerAmount} {WAGER_ASSET_CODE}</span>
            </div>
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">Second Place</span>
              <span className="font-medium">
                {isWin ? roundData.secondPlace : 'You'}
              </span>
            </div>
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">Third Place</span>
              <span className="font-medium">{roundData.thirdPlace}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderFooter = () => {
    return (
      <div className="flex gap-4 justify-center mt-10 w-full">
        <Button
          variant="outline"
          size="lg"
          className="w-[238px] px-2 py-6 border-[#9747FF] h-[72px] flex justify-center items-center rounded-full font-medium text-md text-[#9747FF]"
          onClick={handleShare}
        >
          Share
        </Button>
        <Button
          variant="purple"
          size="lg"
          className="w-[238px] px-2 py-6 h-[72px] flex justify-center items-center rounded-full font-medium text-md text-white"
          onClick={handleClaimEarnings}
          disabled={isLoading}
        >
          {isLoading ? 'Claiming...' : 'Claim Earning'}
        </Button>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={handleCloseModal}
      title=""
      footerContent={renderFooter()}
    >
      {renderResultContent()}
    </Modal>
  );
};

export default GameResultPopup;
