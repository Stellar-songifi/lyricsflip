import type { Meta, StoryObj } from '@storybook/react';
import RoundScoreboard from './round-scoreboard';

const players = [
  'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
  'GBCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW',
];

const meta: Meta<typeof RoundScoreboard> = {
  title: 'Organisms/RoundScoreboard',
  component: RoundScoreboard,
  args: {
    players,
    scores: { [players[0]]: 1200, [players[1]]: 800 },
    answered: { [players[0]]: 3, [players[1]]: 2 },
    currentAddress: players[0],
  },
};
export default meta;

type Story = StoryObj<typeof RoundScoreboard>;

export const InProgress: Story = {};

export const Finished: Story = {
  args: { winners: [players[0]] },
};

export const WithDisplayNames: Story = {
  args: {
    displayName: (address: string) =>
      address === players[0] ? 'alice' : 'bob',
  },
};
