import type { Meta, StoryObj } from '@storybook/react';
import { GameResultModal } from './game-result-modal';

const meta: Meta<typeof GameResultModal> = {
  title: 'Organisms/GameResultModal',
  component: GameResultModal,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/single-player', query: { roundId: '1' } },
    },
  },
};
export default meta;

type Story = StoryObj<typeof GameResultModal>;

const baseRoundData = {
  score: 4,
  maxRounds: 5,
  odds: 1,
  wagerAmount: '5',
  potentialWin: '10',
};

/** Winner view — high score, claim-winnings button. */
export const Won: Story = {
  args: {
    isOpen: true,
    modalType: 'won',
    roundId: '1',
    roundData: baseRoundData,
  },
};

/** Loser view — wager-lost row shown. */
export const Lost: Story = {
  args: {
    isOpen: true,
    modalType: 'lost',
    roundId: '2',
    roundData: { ...baseRoundData, score: 1 },
  },
};

/** Cancelled round — refund row shown. */
export const Cancelled: Story = {
  args: {
    isOpen: true,
    modalType: 'cancelled',
    roundId: '3',
    roundData: {
      ...baseRoundData,
      is_cancelled: true,
      refundAmount: '5',
    },
  },
};

/** Loading state while fetching round data. */
export const Loading: Story = {
  args: {
    isOpen: true,
    modalType: 'won',
    roundId: '99',
    // No roundData passed — the component will try to fetch and show a spinner
  },
};

/** Closed — renders nothing. */
export const Closed: Story = {
  args: { isOpen: false },
};
