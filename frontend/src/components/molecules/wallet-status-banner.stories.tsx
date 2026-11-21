import type { Meta, StoryObj } from '@storybook/react';
import { WalletStatusBanner } from './wallet-status-banner';

/**
 * WalletStatusBanner conditionally shows warnings based on wallet state.
 * Because the banner hides itself when there is nothing to report, the stories
 * below rely on the fact that (a) no wallet is connected in Storybook, and
 * (b) NODE_ENV is not production, so dev-warning code paths are exercised.
 *
 * Full integration testing of the network-mismatch and low-balance paths
 * happens in the unit test suite where the Stellar hooks can be mocked.
 */
const meta: Meta<typeof WalletStatusBanner> = {
  title: 'Molecules/WalletStatusBanner',
  component: WalletStatusBanner,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    className: '',
  },
};
export default meta;

type Story = StoryObj<typeof WalletStatusBanner>;

/**
 * With no wallet connected and no warnings the banner renders nothing.
 * Storybook will show an empty canvas — that is the correct output.
 */
export const NoWallet: Story = {};

/**
 * Pass a custom class to verify the className prop is forwarded.
 * The banner still renders nothing when there's nothing to report, but the
 * className wiring is exercised if warnings are present.
 */
export const WithClassName: Story = {
  args: { className: 'border-b border-gray-200' },
};
