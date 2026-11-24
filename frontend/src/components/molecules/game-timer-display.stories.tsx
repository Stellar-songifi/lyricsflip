import type { Meta, StoryObj } from '@storybook/react';
import { GameTimerDisplay } from './game-timer-display';

/**
 * GameTimerDisplay pulls score/level from the Zustand store and drives a
 * countdown via useGameTimer. Stories exercise the visual output; actual timer
 * interactions are covered by unit tests.
 */
const meta: Meta<typeof GameTimerDisplay> = {
  title: 'Molecules/GameTimerDisplay',
  component: GameTimerDisplay,
  parameters: {
    layout: 'centered',
  },
};
export default meta;

type Story = StoryObj<typeof GameTimerDisplay>;

/** Default idle state — game has not started. */
export const Idle: Story = {};

/**
 * To exercise the "time running out" visual (red bar) the story simply renders
 * the component; the store starts with timeLeft = 15 and the storedriven
 * timer only ticks once a game is started via the "Start New Game" button.
 */
export const Default: Story = {};
