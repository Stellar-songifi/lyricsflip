'use client';

import { useTranslations } from 'next-intl';
import { GameCard } from '../molecules/game-mode-card';

export type GameOption = {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  bgPattern: string;
  bgColor: string;
  borderColor: string;
};

const GAME_IDS = ['quick-game', 'single-player', 'multi-player', 'challenge'] as const;

export function GameOptions({ onSelectGame }: { onSelectGame?: (gameId: string) => void }) {
  const t = useTranslations('gameOptions');

  const gameOptions: GameOption[] = GAME_IDS.map((id) => ({
    id,
    title: t(`titles.${id}`),
    description: t('description'),
    icon:
      id === 'quick-game'
        ? '/quick.svg'
        : id === 'single-player'
          ? '/wagersingle.svg'
          : id === 'multi-player'
            ? '/wagermulti.svg'
            : '/join.svg',
    color:
      id === 'quick-game'
        ? 'bg-[#9747FF]'
        : id === 'single-player'
          ? 'bg-[#3F8AB6]'
          : id === 'multi-player'
            ? 'bg-[#DF7A16]'
            : 'bg-[#7D1D3F]',
    bgPattern: id === 'quick-game' ? '/cardline.svg' : id === 'single-player' ? '/card2line.svg' : id === 'multi-player' ? '/card3line.svg' : '/card4line.svg',
    bgColor:
      id === 'quick-game'
        ? 'bg-[#EDE9F2]'
        : id === 'single-player'
          ? 'bg-[#E1EDF4]'
          : id === 'multi-player'
            ? 'bg-[#F6EDE5]'
            : 'bg-[#F2E6EA]',
    borderColor:
      id === 'quick-game'
        ? 'border-[#E0D9E8]'
        : id === 'single-player'
          ? 'border-[#D2E4EF]'
          : id === 'multi-player'
            ? 'border-[#EFE0D2]'
            : 'border-[#EAD7DD]',
  }));

  return (
    <div className="grid gap-5 sm:grid-cols-2 w-full">
      {gameOptions.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          onSelect={onSelectGame ? () => onSelectGame(game.id) : undefined}
        />
      ))}
    </div>
  );
}
