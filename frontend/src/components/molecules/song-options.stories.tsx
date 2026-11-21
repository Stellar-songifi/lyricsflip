import type { Meta, StoryObj } from '@storybook/react';
import { SongOptions, type SongOption } from './song-options';

const options: SongOption[] = [
  { title: 'Hello', artist: 'Adele', year: 2015 },
  { title: 'Halo', artist: 'Beyoncé', year: 2008 },
  { title: 'Yellow', artist: 'Coldplay', year: 2000 },
  { title: 'Hey Ya!', artist: 'OutKast', year: 2003 },
];

const meta: Meta<typeof SongOptions> = {
  title: 'Molecules/SongOptions',
  component: SongOptions,
  args: { options, onSelect: () => {} },
};
export default meta;

type Story = StoryObj<typeof SongOptions>;

export const Unanswered: Story = {};

export const Answered: Story = {
  args: {
    selectedOption: options[1],
    correctOption: options[0],
    disabled: true,
  },
};

export const ArtistQuestion: Story = {
  args: { questionKind: 'Artist' },
};
