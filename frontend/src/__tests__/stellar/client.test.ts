/**
 * Tests for src/lib/stellar/client.ts
 * Mocks `contract.Client.from` and `StellarWalletsKit` so no network is needed.
 */
import { createSystemCalls } from '@/lib/stellar/client';
import { contract } from '@stellar/stellar-sdk';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import type { StellarConfig } from '@/lib/stellar/stellarConfig';
import type { WireCard, WireRound } from '@/lib/stellar/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TEST_CONFIG: StellarConfig = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  lyricsflipContractId: 'CTEST_CONTRACT_ID',
  lyricsflipNftContractId: 'CTEST_NFT_CONTRACT_ID',
};

const TEST_ADDRESS = 'GABCDE1234567890TESTADDRESS';

const makeWireCard = (overrides: Partial<WireCard> = {}): WireCard => ({
  card_id: BigInt(1),
  genre: 1, // Pop
  artist: 'Test Artist',
  title: 'Test Song',
  year: BigInt(2020),
  lyrics: 'Test lyrics here',
  ...overrides,
});

const makeWireRound = (overrides: Partial<WireRound> = {}): WireRound => ({
  round_id: BigInt(1),
  admin: TEST_ADDRESS,
  genre: 0, // HipHop
  wager_amount: BigInt(0),
  start_time: BigInt(0),
  is_started: true,
  is_completed: false,
  end_time: BigInt(0),
  next_card_index: 0,
  is_cancelled: false,
  ...overrides,
});

// Helper: build an assembled-transaction mock that returns a value on `.result`
const makeAssembled = <T>(result: T, signAndSend?: () => Promise<{ result: T }>) => ({
  result,
  signAndSend: signAndSend ?? (() => Promise.resolve({ result })),
});

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------
const mockContractMethods = {
  create_round: jest.fn(),
  join_round: jest.fn(),
  start_round: jest.fn(),
  next_card: jest.fn(),
  submit_answer: jest.fn(),
  add_card: jest.fn(),
  add_cards: jest.fn(),
  get_card: jest.fn(),
  get_cards_count: jest.fn(),
  set_cards_per_round: jest.fn(),
  set_role: jest.fn(),
  is_admin: jest.fn(),
  get_round: jest.fn(),
  get_round_cards: jest.fn(),
  get_round_players: jest.fn(),
  get_player_stat: jest.fn(),
  get_cards_of_genre: jest.fn(),
  get_cards_of_artist: jest.fn(),
  get_cards_of_a_year: jest.fn(),
  build_question_card: jest.fn(),
  claim_reward: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (contract.Client.from as jest.Mock).mockResolvedValue(mockContractMethods);
});

// ---------------------------------------------------------------------------
// requireAccount guard
// ---------------------------------------------------------------------------
describe('requireAccount (disconnected wallet)', () => {
  it('createRound throws when no wallet is connected', async () => {
    const calls = createSystemCalls(TEST_CONFIG, null);
    await expect(calls.createRound('Pop')).rejects.toThrow(
      'Connect a Stellar wallet before performing this action.',
    );
  });

  it('joinRound throws when no wallet is connected', async () => {
    const calls = createSystemCalls(TEST_CONFIG, null);
    await expect(calls.joinRound(BigInt(1))).rejects.toThrow(
      'Connect a Stellar wallet',
    );
  });

  it('startRound throws when no wallet is connected', async () => {
    const calls = createSystemCalls(TEST_CONFIG, null);
    await expect(calls.startRound(BigInt(1))).rejects.toThrow(
      'Connect a Stellar wallet',
    );
  });

  it('submitAnswer throws when no wallet is connected', async () => {
    const calls = createSystemCalls(TEST_CONFIG, null);
    const { Answer } = await import('@/lib/stellar/types');
    await expect(calls.submitAnswer(BigInt(1), Answer.title('Test'))).rejects.toThrow(
      'Connect a Stellar wallet',
    );
  });

  it('addCard throws when no wallet is connected', async () => {
    const calls = createSystemCalls(TEST_CONFIG, null);
    await expect(
      calls.addCard({
        genre: 'Pop',
        artist: 'Artist',
        title: 'Title',
        year: BigInt(2020),
        lyrics: 'lyrics',
      }),
    ).rejects.toThrow('Connect a Stellar wallet');
  });

  it('setCardsPerRound throws when no wallet is connected', async () => {
    const calls = createSystemCalls(TEST_CONFIG, null);
    await expect(calls.setCardsPerRound(5)).rejects.toThrow('Connect a Stellar wallet');
  });

  it('claimReward throws when no wallet is connected', async () => {
    const calls = createSystemCalls(TEST_CONFIG, null);
    await expect(calls.claimReward(0)).rejects.toThrow('Connect a Stellar wallet');
  });
});

// ---------------------------------------------------------------------------
// Read-only calls work without a wallet
// ---------------------------------------------------------------------------
describe('read-only calls (no wallet required)', () => {
  it('getRound decodes wire round with genre conversion', async () => {
    const wireRound = makeWireRound({ genre: 1 }); // Pop = 1
    mockContractMethods.get_round.mockResolvedValue(makeAssembled(wireRound));

    const calls = createSystemCalls(TEST_CONFIG, null);
    const round = await calls.getRound(BigInt(1));

    expect(round.genre).toBe('Pop');
    expect(round.round_id).toBe(BigInt(1));
    expect(mockContractMethods.get_round).toHaveBeenCalledWith({ round_id: BigInt(1) });
  });

  it('getCard decodes wire card with genre conversion', async () => {
    const wireCard = makeWireCard({ genre: 2 }); // Rock = 2
    mockContractMethods.get_card.mockResolvedValue(makeAssembled(wireCard));

    const calls = createSystemCalls(TEST_CONFIG, null);
    const card = await calls.getCard(BigInt(1));

    expect(card.genre).toBe('Rock');
    expect(card.title).toBe('Test Song');
  });

  it('getCardsCount returns bigint result', async () => {
    mockContractMethods.get_cards_count.mockResolvedValue(makeAssembled(BigInt(42)));

    const calls = createSystemCalls(TEST_CONFIG, null);
    const count = await calls.getCardsCount();

    expect(count).toBe(BigInt(42));
  });

  it('isAdmin returns boolean result', async () => {
    mockContractMethods.is_admin.mockResolvedValue(makeAssembled(true));

    const calls = createSystemCalls(TEST_CONFIG, null);
    const result = await calls.isAdmin(TEST_ADDRESS);

    expect(result).toBe(true);
    expect(mockContractMethods.is_admin).toHaveBeenCalledWith({ role: 0, address: TEST_ADDRESS });
  });

  it('getPlayerStat returns PlayerStats', async () => {
    const stats = {
      total_rounds: BigInt(10),
      rounds_won: BigInt(7),
      current_streak: BigInt(3),
      max_streak: BigInt(5),
    };
    mockContractMethods.get_player_stat.mockResolvedValue(makeAssembled(stats));

    const calls = createSystemCalls(TEST_CONFIG, null);
    const result = await calls.getPlayerStat(TEST_ADDRESS);

    expect(result.total_rounds).toBe(BigInt(10));
    expect(result.rounds_won).toBe(BigInt(7));
  });

  it('getRoundCards returns array of bigints', async () => {
    mockContractMethods.get_round_cards.mockResolvedValue(
      makeAssembled([BigInt(1), BigInt(2), BigInt(3)]),
    );

    const calls = createSystemCalls(TEST_CONFIG, null);
    const cards = await calls.getRoundCards(BigInt(1));

    expect(cards).toEqual([BigInt(1), BigInt(2), BigInt(3)]);
  });

  it('getRoundPlayers returns array of addresses', async () => {
    mockContractMethods.get_round_players.mockResolvedValue(
      makeAssembled([TEST_ADDRESS]),
    );

    const calls = createSystemCalls(TEST_CONFIG, null);
    const players = await calls.getRoundPlayers(BigInt(1));

    expect(players).toEqual([TEST_ADDRESS]);
  });

  it('isRoundPlayer returns true when address is in player list', async () => {
    mockContractMethods.get_round_players.mockResolvedValue(
      makeAssembled([TEST_ADDRESS, 'OTHER_ADDRESS']),
    );

    const calls = createSystemCalls(TEST_CONFIG, null);
    const result = await calls.isRoundPlayer(BigInt(1), TEST_ADDRESS);

    expect(result).toBe(true);
  });

  it('isRoundPlayer returns false when address is not in player list', async () => {
    mockContractMethods.get_round_players.mockResolvedValue(
      makeAssembled(['OTHER_ADDRESS']),
    );

    const calls = createSystemCalls(TEST_CONFIG, null);
    const result = await calls.isRoundPlayer(BigInt(1), TEST_ADDRESS);

    expect(result).toBe(false);
  });

  it('getCardsOfGenre converts genre to wire and maps results', async () => {
    const wireCards = [makeWireCard({ genre: 1 })]; // Pop
    mockContractMethods.get_cards_of_genre.mockResolvedValue(makeAssembled(wireCards));

    const calls = createSystemCalls(TEST_CONFIG, null);
    const cards = await calls.getCardsOfGenre('Pop', BigInt(42));

    expect(cards[0].genre).toBe('Pop');
    expect(mockContractMethods.get_cards_of_genre).toHaveBeenCalledWith(
      expect.objectContaining({ genre: 1, seed: BigInt(42) }),
    );
  });
});

// ---------------------------------------------------------------------------
// Mutating calls with connected wallet
// ---------------------------------------------------------------------------
describe('mutating calls with connected wallet', () => {
  it('createRound sends correct wire args and returns round id', async () => {
    mockContractMethods.create_round.mockResolvedValue(
      makeAssembled(BigInt(99)),
    );

    const calls = createSystemCalls(TEST_CONFIG, TEST_ADDRESS);
    const roundId = await calls.createRound('Jazz', BigInt(12345));

    expect(roundId).toBe(BigInt(99));
    expect(mockContractMethods.create_round).toHaveBeenCalledWith({
      caller: TEST_ADDRESS,
      genre: 6, // Jazz = 6
      seed: BigInt(12345),
    });
  });

  it('submitAnswer passes the answer through unchanged', async () => {
    mockContractMethods.submit_answer.mockResolvedValue(makeAssembled(true));
    const { Answer } = await import('@/lib/stellar/types');

    const calls = createSystemCalls(TEST_CONFIG, TEST_ADDRESS);
    const isCorrect = await calls.submitAnswer(BigInt(1), Answer.title('Bohemian Rhapsody'));

    expect(isCorrect).toBe(true);
    expect(mockContractMethods.submit_answer).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: TEST_ADDRESS,
        round_id: BigInt(1),
        answer: { tag: 'Title', values: ['Bohemian Rhapsody'] },
      }),
    );
  });

  it('nextCard requires account and decodes wire card', async () => {
    const wireCard = makeWireCard({ genre: 0 }); // HipHop
    mockContractMethods.next_card.mockResolvedValue(makeAssembled(wireCard));

    const calls = createSystemCalls(TEST_CONFIG, TEST_ADDRESS);
    const card = await calls.nextCard(BigInt(1));

    expect(card.genre).toBe('HipHop');
  });
});

// ---------------------------------------------------------------------------
// Not-implemented stubs
// ---------------------------------------------------------------------------
describe('not-implemented stubs', () => {
  it('getCategories throws with helpful message', async () => {
    const calls = createSystemCalls(TEST_CONFIG, null);
    await expect(calls.getCategories()).rejects.toThrow(
      'getCategories is not implemented on-chain',
    );
  });

  it('getSongs throws with helpful message', async () => {
    const calls = createSystemCalls(TEST_CONFIG, null);
    await expect(calls.getSongs()).rejects.toThrow('getSongs is not implemented on-chain');
  });

  it('getLeaderboard throws with helpful message', async () => {
    const calls = createSystemCalls(TEST_CONFIG, null);
    await expect(calls.getLeaderboard()).rejects.toThrow(
      'getLeaderboard is not implemented on-chain',
    );
  });

  it('claimEarnings throws with helpful message', async () => {
    const calls = createSystemCalls(TEST_CONFIG, null);
    await expect(calls.claimEarnings()).rejects.toThrow(
      'claimEarnings is not implemented on-chain',
    );
  });
});
