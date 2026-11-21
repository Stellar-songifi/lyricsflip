import '@testing-library/jest-dom';

// Mock @creit.tech/stellar-wallets-kit
jest.mock('@creit.tech/stellar-wallets-kit', () => ({
  StellarWalletsKit: {
    init: jest.fn(),
    setWallet: jest.fn(),
    setNetwork: jest.fn(),
    getAddress: jest.fn(() => Promise.resolve({ address: '' })),
    authModal: jest.fn(() => Promise.resolve({ address: 'GABCDEFMOCKADDRESS' })),
    signTransaction: jest.fn(() => Promise.resolve({ signedTxXdr: '', signerAddress: '' })),
    disconnect: jest.fn(),
  },
  Networks: {
    PUBLIC: 'Public Global Stellar Network ; September 2015',
    TESTNET: 'Test SDF Network ; September 2015',
    FUTURENET: 'Test SDF Future Network ; October 2022',
  },
}));

jest.mock('@creit.tech/stellar-wallets-kit/modules/freighter', () => ({ FreighterModule: jest.fn() }));
jest.mock('@creit.tech/stellar-wallets-kit/modules/xbull', () => ({ xBullModule: jest.fn() }));
jest.mock('@creit.tech/stellar-wallets-kit/modules/albedo', () => ({ AlbedoModule: jest.fn() }));
jest.mock('@creit.tech/stellar-wallets-kit/modules/lobstr', () => ({ LobstrModule: jest.fn() }));
jest.mock('@creit.tech/stellar-wallets-kit/modules/hana', () => ({ HanaModule: jest.fn() }));

// Mock @stellar/stellar-sdk's contract client and StrKey
jest.mock('@stellar/stellar-sdk', () => ({
  contract: {
    Client: {
      from: jest.fn(() => Promise.resolve({})),
    },
  },
  StrKey: {
    isValidContract: jest.fn((id: string) => {
      return typeof id === 'string' && id.startsWith('C') && id.length === 56;
    }),
    isValidEd25519PublicKey: jest.fn((id: string) => {
      return typeof id === 'string' && id.startsWith('G') && id.length === 56;
    }),
  },
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    query: {},
    pathname: '/',
    asPath: '/',
  }),
  useSearchParams: () => ({
    get: jest.fn(),
  }),
}));

// Mock the Stellar hooks module so route tests can render pages without a
// real wallet connection. Individual tests can override these with
// jest.mock('@/lib/stellar/hooks/use-stellar', ...) or mockReturnValue.
jest.mock('@/lib/stellar/hooks/use-stellar', () => ({
  useStellar: jest.fn(() => ({
    systemCalls: null,
    account: null,
    isLoading: false,
    error: null,
    connect: jest.fn(),
  })),
}));

// Mock next/image to a plain <img> to avoid Next runtime requirements
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const { src, alt, width, height, ...rest } = props as {
      src?: string;
      alt?: string;
      width?: number;
      height?: number;
    };
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return require('react').createElement('img', {
      src,
      alt,
      width,
      height,
      ...rest,
    });
  },
}));

// Mock next/link to a plain <a> element
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children?: unknown; href?: unknown }) =>
    require('react').createElement('a', { href, ...rest }, children),
}));

// Add required JSDOM setup for Next.js
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Stub ResizeObserver for components that rely on it
if (typeof global.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
  }
  (global as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

// Add any other global mocks here
