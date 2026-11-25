/** LF-365: the banner explains a wiped testnet contract instance. */
const mockUseContractAvailability = jest.fn();

jest.mock('@/lib/stellar/hooks/use-contract-availability', () => ({
  useContractAvailability: () => mockUseContractAvailability(),
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TestnetResetBanner } from '@/components/molecules/testnet-reset-banner';

describe('TestnetResetBanner', () => {
  beforeEach(() => {
    mockUseContractAvailability.mockReset();
  });

  it('shows an explicit reset message when an instance is missing', () => {
    mockUseContractAvailability.mockReturnValue({
      isTestnetReset: true,
      missingContracts: ['C'.padEnd(56, 'A')],
      isLoading: false,
      refresh: jest.fn(),
    });

    render(<TestnetResetBanner />);

    expect(screen.getByRole('alert')).toHaveTextContent('Stellar testnet was reset');
    expect(screen.getByRole('alert')).toHaveTextContent('contract not found');
  });

  it('renders nothing while the check is still loading', () => {
    mockUseContractAvailability.mockReturnValue({
      isTestnetReset: false,
      missingContracts: [],
      isLoading: true,
      refresh: jest.fn(),
    });

    const { container } = render(<TestnetResetBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the contracts are present', () => {
    mockUseContractAvailability.mockReturnValue({
      isTestnetReset: false,
      missingContracts: [],
      isLoading: false,
      refresh: jest.fn(),
    });

    const { container } = render(<TestnetResetBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
