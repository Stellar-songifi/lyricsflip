import { Copy, Lightbulb, X } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Round } from '@/lib/stellar/types';
import { formatAmount, WAGER_ASSET_CODE } from '@/lib/utils';

interface ChallengeInviteProps {
  round: Round;
  players: string[];
  isReady: boolean;
  isBusy: boolean;
  onReady: () => void;
  /** LF-305: private rounds share the code in the URL fragment. */
  inviteCode?: string;
}

export default function ChallengeInvite({
  round,
  players,
  isReady,
  isBusy,
  onReady,
  inviteCode: privateCode,
}: ChallengeInviteProps) {
  const t = useTranslations('challengeInvite');
  const router = useRouter();
  const [isCopied, setIsCopied] = useState(false);

  const inviteCode = round.round_id.toString();
  const inviteLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/multiplayer/${inviteCode}${
          privateCode ? `#invite=${encodeURIComponent(privateCode)}` : ''
        }`
      : '';

  const handleCopyCode = () => {
    navigator.clipboard
      .writeText(inviteLink)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy text: ', err);
      });
  };

  const handleClose = () => {
    router.back();
  };

  const handleShareInvite = () => {
    if (navigator.share) {
      navigator
        .share({
          title: t('shareTitle'),
          text: t('shareText', { roundId: inviteCode }),
          url: inviteLink,
        })
        .catch((err) => console.warn('Error sharing:', err));
    } else {
      handleCopyCode();
      alert(t('inviteCopied'));
    }
  };

  const challengeData = {
    gameMode: `${t('gameModeValue')} · ${round.genre}`,
    participants: players.length,
    wagerAmount: `${formatAmount(round.wager_amount)} ${WAGER_ASSET_CODE}`,
  };

  return (
    <div className="w-full h-auto bg-black/10 flex justify-end p-10">
      <div className="w-full max-w-[580px] min-h-[960px] h-full bg-white rounded-[16px] border-[1.5px] border-[#DBE2E8] p-[32px]">
        <div className="flex justify-end">
          <p
            className="hover:cursor-pointer w-fit p-1 border border-[#DBE1E7] rounded-full"
            onClick={handleClose}
          >
            <X size={16} color="#090909" />
          </p>
        </div>
        <div className="w-full flex flex-col gap-[4px]">
          <h1
            aria-label={t('title')}
            className="text-[24px] font-[600]"
          >
            {t('title')}
          </h1>
          <p className="text-[14px] font-[400] text-[#120029]">
            {t('subtitle')}
          </p>
        </div>

        <div className="flex justify-center items-center space-x-3 my-5">
          <h1
            aria-label="invite Code"
            className="sm:text-[48px] text-[30px] font-[800]"
          >
            {inviteCode}
          </h1>
          <span
            className="hover:cursor-pointer w-fit"
            onClick={handleCopyCode}
            title={isCopied ? t('copied') : t('copyToClipboard')}
          >
            <Copy color="#9747FF" />
            {isCopied && <span className="sr-only">{t('copied')}</span>}
          </span>
        </div>

        <div className="flex flex-col gap-[12px]">
          <div className="flex w-full border-b border-black/30 justify-between text-[16px] font-[400]">
            <span className="p-[12px] text-[#636363]">{t('gameMode')}</span>
            <span className="font-[500]">{challengeData.gameMode}</span>
          </div>
          <div className="flex w-full border-b border-black/30 justify-between text-[16px] font-[400]">
            <span className="p-[12px] text-[#636363]">
              {t('participants')}
            </span>
            <span className="font-[500]">{challengeData.participants}</span>
          </div>
          <div className="flex w-full border-b border-black/30 justify-between text-[16px] font-[400]">
            <span className="p-[12px] text-[#636363]">{t('wagerAmount')}</span>
            <span className="font-[500]">{challengeData.wagerAmount}</span>
          </div>
        </div>

        <div className="border-[0.5px] p-[16px] rounded-[12px] gap-[17px] bg-[#F0F0F0] flex flex-col mt-5">
          <div className="flex space-x-1 items-center text-[#9747FF]">
            <Lightbulb size={16} />
            <span className="text-[12px] font-[500]">{t('instructionHeading')}</span>
          </div>
          <p className="text-[16px] bg-white font-[400] text-[#08090A] border p-[16px] rounded-[8px] border-[#DBE1E7]">
            {t('instructionText')}
          </p>
        </div>

        <div className="w-full flex gap-[32px] mb-10 mt-20">
          <button
            type="button"
            onClick={handleShareInvite}
            className="w-full rounded-full bg-transparent border border-[#9747FF] hover:bg-[#9747FF] text-[#9747FF] py-[24px] hover:text-white text-[16px] font-[600] transition-all duration-200"
          >
            {t('shareInviteLink')}
          </button>
          <button
            type="button"
            onClick={onReady}
            disabled={isReady || isBusy}
            className="w-full rounded-full bg-[#9747FF] border border-[#9747FF] hover:bg-transparent text-white py-[24px] hover:text-[#9747FF] text-[16px] font-[600] transition-all duration-200"
          >
            {isReady
              ? t('waitingForPlayers')
              : isBusy
                ? t('submitting')
                : t('ready')}
          </button>
        </div>
      </div>
    </div>
  );
}
