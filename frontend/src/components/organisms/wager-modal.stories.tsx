import type { Meta, StoryObj } from '@storybook/react';
import { userEvent, within, expect } from '@storybook/test';
import { WagerModal } from './wager-modal';

/**
 * WagerModal integrates Zustand (modal state), Next.js router, and the Stellar
 * provider. In Storybook we wire up the minimum mocks required by
 * @storybook/nextjs's built-in router stub.
 *
 * The modal visibility is driven by the global `useModalStore`. Each story
 * renders the component; use the play function to open the modal via
 * `useModalStore.getState().openModal('wager')` or simply render it already
 * open by patching the store before the story mounts.
 */
const meta: Meta<typeof WagerModal> = {
  title: 'Organisms/WagerModal',
  component: WagerModal,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof WagerModal>;

/** The modal is closed — renders nothing visible. */
export const Closed: Story = {};

/**
 * Open the modal with the form stage visible.
 * Uses a play function to open the modal through its store method so the
 * story exercises the real open/close flow.
 */
export const FormStage: Story = {
  play: async () => {
    // Dynamically import to avoid issues with SSR in the story environment
    const { useModalStore } = await import('@/store/modal-store');
    useModalStore.getState().openModal('wager');
  },
};
