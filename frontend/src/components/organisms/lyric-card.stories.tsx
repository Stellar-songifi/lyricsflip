import type { Meta, StoryObj } from '@storybook/react';
import { LyricCard } from './lyric-card';

const meta: Meta<typeof LyricCard> = {
  title: 'Organisms/LyricCard',
  component: LyricCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    lyrics: [
      {
        text: "I keep bleeding, keep keep bleeding love\nYou cut me open and I\nKeep bleeding, keep keep bleeding love",
        title: 'Bleeding Love',
        artist: 'Leona Lewis',
      },
    ],
    isFlipped: false,
  },
};
export default meta;

type Story = StoryObj<typeof LyricCard>;

export const Front: Story = {};

export const Flipped: Story = {
  args: { isFlipped: true },
  play: async ({ canvasElement }) => {
    // The flipped state is controlled externally; confirming the back face is visible
    const region = canvasElement.querySelector('[role="region"]');
    if (region) {
      const label = region.getAttribute('aria-label') ?? '';
      if (!label.includes('Answer revealed')) {
        throw new Error('Expected aria-label to say "Answer revealed" when flipped');
      }
    }
  },
};

export const LongLyric: Story = {
  args: {
    lyrics: [
      {
        text: "We found love in a hopeless place\nWe found love in a hopeless place\nWe found love in a hopeless place\nWe found love in a hopeless place",
        title: 'We Found Love',
        artist: 'Rihanna ft. Calvin Harris',
      },
    ],
  },
};

export const ReducedMotion: Story = {
  parameters: {
    chromatic: { prefersReducedMotion: 'reduce' },
  },
  args: { isFlipped: true },
};
