import type { Meta, StoryObj } from '@storybook/react';
import { PracticeModal } from './practice-modal';

const meta: Meta<typeof PracticeModal> = {
  title: 'Organisms/PracticeModal',
  component: PracticeModal,
  parameters: {
    layout: 'fullscreen',
  },
};
export default meta;

type Story = StoryObj<typeof PracticeModal>;

/** Closed — renders nothing. */
export const Closed: Story = {};

/** Open the practice modal via the modal store. */
export const Open: Story = {
  play: async () => {
    const { useModalStore } = await import('@/store/modal-store');
    useModalStore.getState().openModal('practice');
  },
};
