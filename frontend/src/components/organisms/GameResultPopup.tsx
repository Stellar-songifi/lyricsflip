'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { FaCircleCheck } from 'react-icons/fa6';
import { MdCancel } from 'react-icons/md';
import { Button } from '@/components/atoms/button';
import { Modal } from './modal';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { useTranslations } from 'next-intl';

interface GameResultPopupProps {
  isWin: boolean;
  isMultiplayer: boolean;
}

interface GameResultData {
  score?: number;
  maxRounds?: number;
  odds?: string | number;
  wagerAmount?: string;
  potentialWin?: string;
  winner?: string;
  prize?: string;
  secondPlace?: string;
  thirdPlace?: string;
}

interface GameResultData {
  score?: number;
  maxRounds?: number;
  odds?: string | number;
  wagerAmount?: string;
  potentialWin?: string;
  winner?: string;
  prize?: string;
  secondPlace?: string;
  thirdPlace?: string;
}

const GameResultPopup: React.FC<GameResultPopupProps> = ({
  isWin,
  isMultiplayer,
}) => {
  const t = useTranslations('results');
  const [isModalOpen, setIsModalOpen] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { systemCalls } = useStellar();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roundData, setRoundData] = useState<GameResultData | null>(null);

  const roundId = searchParams.get('roundId');

  useEffect(() => {
    const fetchRoundData = async () => {
      if (!systemCalls) {
        setError(t('noSystemCalls'));
        return;
      }

      if (!roundId) return;

      try {
        setIsLoading(true);
        const data = await systemCalls.getRound(BigInt(roundId));
        setRoundData(data as unknown as GameResultData);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('failedFetch'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoundData();
  }, [roundId, systemCalls, t]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    router.push('/');
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: t('shareTitle'),
        text: t('shareText', { score: roundData?.score || 0 }),
        url: window.location.href,
      }).catch((err) => console.warn('Error sharing:', err));
    } else {
      navigator.clipboard.writeText(window.location.href)
        .then(() => alert(t('linkCopied')))
        .catch((err) => console.error('Failed to copy:', err));
    }
  };

  const handleClaimEarnings = async () => {
    if (!systemCalls) {
      setError(t('noSystemCalls'));
      return;
    }

    if (!roundId) return;

    try {
      setIsLoading(true);
      await systemCalls.claimEarnings();
      alert(t('claimSuccess'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('claimFail'));
    } finally {
      setIsLoading(false);
    }
  };

  const renderResultContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-64">
          <p className="text-[24px] font-[600]">{t('loading')}</p>
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
          <p className="text-[24px] font-[600]">{t('noRound')}</p>
        </div>
      );
    }

    const score = roundData.score || 0;
    const maxRounds = roundData.maxRounds || 0;
    const percent = (score / maxRounds) * 100;

    return (
      <div
        className="space-y-4 mt-10"
        role="status"
        aria-live="polite"
        data-testid="game-result-content"
      >
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
            <span className="text-[#70E3C7]">{score} {t('points')}</span> -{' '}
            {isWin && isMultiplayer ? (
              <span>{t('youWonMultiplayer')}</span>
            ) : isWin ? (
              <span>{t('youAreAmazing')}</span>
            ) : (
              <span>{t('youLost')}</span>
            )}
          </p>
        </div>

        {!isMultiplayer ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">{t('score')}</span>
              <span className="font-medium">
                {`${score} / ${maxRounds}`} ({percent.toFixed()}%)
              </span>
            </div>
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">{t('odds')}</span>
              <span className="font-medium flex items-center gap-2">
                {roundData.odds} {t('oddsUnit')} {t('getEverythingRight')}{' '}
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
              <span className="text-gray-600">{t('wagerAmount')}</span>
              <span className="font-medium">{`${roundData.wagerAmount} ${t('strk')}`}</span>
            </div>
            {isWin && (
              <div className="flex justify-between items-center border-b py-[12px]">
                <span className="text-gray-600">{t('youWin')}</span>
                <span className="font-medium text-[#9747FF]">
                  {`${roundData.potentialWin} ${t('strk')}`}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">{t('winner')}</span>
              <span className="font-medium">
                {isWin ? t('you') : roundData.winner}
              </span>
            </div>
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">{t('prizeWon')}</span>
              <span className="font-medium text-[#9747FF]">
                {`${roundData.prize} ${t('strk')}`}
              </span>
            </div>
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">{t('wagerAmount')}</span>
              <span className="font-medium">{`${roundData.wagerAmount} ${t('strk')}`}</span>
            </div>
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">{t('secondPlace')}</span>
              <span className="font-medium">
                {isWin ? roundData.secondPlace : t('you')}
              </span>
            </div>
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">{t('thirdPlace')}</span>
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
          {t('share')}
        </Button>
        <Button
          variant="purple"
          size="lg"
          className="w-[238px] px-2 py-6 h-[72px] flex justify-center items-center rounded-full font-medium text-md text-white"
          onClick={handleClaimEarnings}
          disabled={isLoading}
        >
          {isLoading ? t('claiming') : t('claimEarning')}
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
