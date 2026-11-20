import { render } from '@testing-library/react';
import { StatisticsPanel } from '@/components/molecules/statistics-panel';

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
jest.mock('@/lib/stellar/hooks/use-stellar', () => ({
  useStellar: () => ({
    account: null,
    systemCalls: {},
    setup: null,
    isLoading: false,
    error: null,
  })
}));

// Mock GameResultPopup component
jest.mock('@/components/organisms/game-result-popup', () => ({
  __esModule: true,
  default: () => null,
}));

describe('StatisticsPanel', () => {
  test('renders without crashing', () => {
    const { container } = render(
      <StatisticsPanel 
        time={''} 
        potWin={''} 
        scores={''} 
      />
    );
    expect(container).toBeTruthy();
  });
});