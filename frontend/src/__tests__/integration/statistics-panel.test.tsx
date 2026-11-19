import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { StatisticsPanel } from '@/components/molecules/statistics-panel';
import enMessages from '../../../messages/en.json';

// Mock Next.js dependencies
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    query: {},
  }),
  useSearchParams: () => ({
    get: jest.fn(),
  }),
}));

// Mock Stellar hooks
jest.mock('@/lib/stellar/hooks/useStellar', () => ({
  useStellar: () => ({
    account: null,
    systemCalls: {},
    setup: null,
    isLoading: false,
    error: null,
  })
}));

// Mock GameResultPopup component
jest.mock('@/components/organisms/GameResultPopup', () => ({
  __esModule: true,
  default: () => null,
}));

describe('StatisticsPanel', () => {
  test('renders without crashing', () => {
    const { container } = render(
      <NextIntlClientProvider messages={enMessages} locale="en">
        <StatisticsPanel 
          time={''} 
          potWin={''} 
          scores={''} 
        />
      </NextIntlClientProvider>
    );
    expect(container).toBeTruthy();
  });
});