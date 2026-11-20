'use client';

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

const gameOptions: GameOption[] = [
  {
    id: 'quick-game',
    title: 'Quick Game',
    description: 'Jump straight in — no setup required. Guess lyrics across all genres and beat the clock.',
    icon: '/quick.svg',
    color: 'bg-[#9747FF]',
    bgPattern: '/cardline.svg',
    bgColor: 'bg-[#EDE9F2]',
    borderColor: 'border-[#E0D9E8]',
  },
  {
    id: 'single-player',
    title: 'Wager (Single Player)',
    description: 'Choose your genre, set a wager, and race solo to identify as many lyrics as possible.',
    icon: '/wagersingle.svg',
    color: 'bg-[#3F8AB6]',
    bgPattern: '/card2line.svg',
    bgColor: 'bg-[#E1EDF4]',
    borderColor: 'border-[#D2E4EF]',
  },
  {
    id: 'multi-player',
    title: 'Wager (Multi Player)',
    description: 'Create a round, invite friends, and compete head-to-head. Winner takes the pot.',
    icon: '/wagermulti.svg',
    color: 'bg-[#DF7A16]',
    bgPattern: '/card3line.svg',
    bgColor: 'bg-[#F6EDE5]',
    borderColor: 'border-[#EFE0D2]',
  },
  {
    id: 'challenge',
    title: 'Join a Challenge',
    description: 'Accept a challenge from a friend and go head-to-head to prove who knows more lyrics.',
    icon: '/join.svg',
    color: 'bg-[#7D1D3F]',
    bgPattern: '/card4line.svg',
    bgColor: 'bg-[#F2E6EA]',
    borderColor: 'border-[#EAD7DD]',
  },
];

interface GameOptionsProps {
  onSelectGame?: (gameId: string) => void;
}

export function GameOptions({ onSelectGame }: GameOptionsProps) {
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