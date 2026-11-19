import { useModalStore } from '@/store/modal-store';
import { Modal } from './modal';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check } from 'lucide-react';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface GameResultData {
  score?: number;
  maxRounds?: number;
  odds?: string | number;
  wagerAmount?: string;
  potentialWin?: string;
}

export const GameResultModal = () => {
  const t = useTranslations('results');
  const { isOpen, modalType, closeModal } = useModalStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { systemCalls } = useStellar();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roundData, setRoundData] = useState<GameResultData | null>(null);

  const roundId = searchParams.get('roundId');

  useEffect(() => {
    const fetchRoundData = async () => {
      if (!roundId) return;

      if (!systemCalls) {
        setError(t('noSystemCalls'));
        return;
      }

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

    const imageSrc = modalType === 'won' ? '/success.png' : '/failed.png';
    const title = modalType === 'won' ? t('youAreAmazing') : t('betterLuck');
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
          <Image width={200} height={200} src={imageSrc} alt="" />
          <p className="font-bold text-[32px]">
            <span className="text-[#70E3C7]">{score} {t('points')}</span> - {title}
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-center border-b py-[12px]">
            <span className="text-gray-600">{t('score')}</span>
            <span className="font-medium">
              {`${score} / ${maxRounds}`} ({percent.toFixed()}%)
            </span>
          </div>

          <div className="flex justify-between items-center border-b py-[12px]">
            <span className="text-gray-600">{t('odds')}</span>
            <span className="font-medium flex items-center gap-1.5">
              {roundData.odds} {t('oddsUnit')} {t('getEverythingRight')}{' '}
              <span className="bg-[#0AC660] rounded-full w-5 h-5 flex items-center justify-center">
                <Check className="text-white w-3 h-3" />
              </span>
            </span>
          </div>

          <div className="flex justify-between items-center border-b py-[12px]">
            <span className="text-gray-600">{t('wagerAmount')}</span>
            <span className="font-medium">
              {`${roundData.wagerAmount} ${t('strk')}`}
            </span>
          </div>
          {modalType === 'won' && (
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">{t('youWin')}</span>
              <span className="font-medium text-[#9747FF]">
                {`${roundData.potentialWin} ${t('strk')}`}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFooter = () => {
    const handleCloseModal = async () => {
      closeModal();
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

    return (
      <div className="flex gap-4 justify-center mt-10 w-full">
        <button
          onClick={handleShare}
          className="cursor-pointer border hover:bg-purple-600 hover:text-[#fff] border-purple-600 text-purple-600 px-4 py-4 w-[50%] rounded-full"
        >
          {t('share')}
        </button>
        <button
          onClick={handleCloseModal}
          className="cursor-pointer hover:bg-white border border-purple-600 hover:text-purple-600 bg-purple-600 text-white px-6 py-4 rounded-full w-[50%]"
        >
          {t('playAgain')}
        </button>
      </div>
    );
  };

  const isModalOpen = isOpen && (modalType === 'won' || modalType === 'lost');

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={closeModal}
      title=""
      footerContent={renderFooter()}
    >
      {renderResultContent()}
    </Modal>
  );
};
