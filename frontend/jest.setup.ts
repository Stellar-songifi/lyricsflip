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

// Mock @stellar/stellar-sdk's contract client
jest.mock('@stellar/stellar-sdk', () => ({
  contract: {
    Client: {
      from: jest.fn(() => Promise.resolve({})),
    },
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

// Add any other global mocks here
