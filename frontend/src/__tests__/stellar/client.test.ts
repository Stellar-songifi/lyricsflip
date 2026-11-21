/**
 * Tests for src/lib/stellar/client.ts
 * Mocks `contract.Client.from` and `StellarWalletsKit` so no network is needed.
 */
import { createSystemCalls, clearGameClientCache } from '@/lib/stellar/client';
import { contract } from '@stellar/stellar-sdk';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import type { StellarConfig } from '@/lib/stellar/stellar-config';
import type { WireCard, WireRound } from '@/lib/stellar/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TEST_CONFIG: StellarConfig = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  lyricsflipContractId: 'CTEST_CONTRACT_ID',
  lyricsflipNftContractId: 'CTEST_NFT_CONTRACT_ID',
  lyricsflipEscrowContractId: '',
  wageringEnabled: false,
};

const TEST_ADDRESS = 'GABCDE1234567890TESTADDRESS';

const makeWireCard = (overrides: Partial<WireCard> = {}): WireCard => ({
  card_id: BigInt(1),
  genre: 1, // Pop
  artist: 'Test Artist',
  title: 'Test Song',
  year: BigInt(2020),
  difficulty: 2,
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

// Helper: build an assembled-transaction mock that returns a value on `.result`.
// `sign()` / `send()` mirror the calls `withTxToast` makes for mutating calls.
const makeAssembled = <T>(
  result: T,
  signAndSend?: () => Promise<{ result: T }>,
  txResponse?: { createdAt?: number; ledger?: number },
) => ({
  result,
  sign: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue({
    result,
    sendTransactionResponse: { hash: 'TEST_TX_HASH' },
    getTransactionResponse: { createdAt: 1_700_000_000, ledger: 1, ...txResponse },
  }),
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
  get_round_scores: jest.fn(),
  finalize_round: jest.fn(),
  get_open_rounds: jest.fn(),
  get_max_players: jest.fn(),
  cancel_round: jest.fn(),
  get_round_cards: jest.fn(),
  get_round_players: jest.fn(),
  get_player_stat: jest.fn(),
  get_cards_of_genre: jest.fn(),
  get_cards_of_artist: jest.fn(),
  get_cards_of_a_year: jest.fn(),
  build_question_card: jest.fn(),
  claim_reward: jest.fn(),
  is_milestone_claimed: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  clearGameClientCache();
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
        difficulty: 2,
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

  it('getRoundScores flattens the contract map into a plain record', async () => {
    mockContractMethods.get_round_scores.mockResolvedValue(
      makeAssembled(
        new Map([
          [TEST_ADDRESS, BigInt(120)],
          ['GOTHERADDRESS', BigInt(60)],
        ]),
      ),
    );

    const calls = createSystemCalls(TEST_CONFIG, null);
    const scores = await calls.getRoundScores(BigInt(1));

    expect(scores).toEqual({ [TEST_ADDRESS]: 120, GOTHERADDRESS: 60 });
    expect(mockContractMethods.get_round_scores).toHaveBeenCalledWith({
      round_id: BigInt(1),
    });
  });

  it('isMilestoneClaimed queries contract with player and milestone', async () => {
    mockContractMethods.is_milestone_claimed.mockResolvedValue(makeAssembled(true));

    const calls = createSystemCalls(TEST_CONFIG, null);
    const claimed = await calls.isMilestoneClaimed(TEST_ADDRESS, 0);

    expect(claimed).toBe(true);
    expect(mockContractMethods.is_milestone_claimed).toHaveBeenCalledWith({
      player: TEST_ADDRESS,
      milestone: 0,
    });
  });

  it('getOpenRounds returns the contract page of round ids', async () => {
    mockContractMethods.get_open_rounds.mockResolvedValue(
      makeAssembled([BigInt(4), BigInt(5)]),
    );

    const calls = createSystemCalls(TEST_CONFIG, null);
    const ids = await calls.getOpenRounds(0, 50);

    expect(ids).toEqual([BigInt(4), BigInt(5)]);
    expect(mockContractMethods.get_open_rounds).toHaveBeenCalledWith({
      start: 0,
      limit: 50,
    });
  });

  it('getMaxPlayers returns the contract setting', async () => {
    mockContractMethods.get_max_players.mockResolvedValue(makeAssembled(8));

    const calls = createSystemCalls(TEST_CONFIG, null);

    await expect(calls.getMaxPlayers()).resolves.toBe(8);
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

  it('finalizeRound sends the caller and round id', async () => {
    mockContractMethods.finalize_round.mockResolvedValue(makeAssembled(null));

    const calls = createSystemCalls(TEST_CONFIG, TEST_ADDRESS);
    await calls.finalizeRound(BigInt(9));

    expect(mockContractMethods.finalize_round).toHaveBeenCalledWith({
      caller: TEST_ADDRESS,
      round_id: BigInt(9),
    });
  });

  it('finalizeRound throws when no wallet is connected', async () => {
    const calls = createSystemCalls(TEST_CONFIG, null);
    await expect(calls.finalizeRound(BigInt(9))).rejects.toThrow(
      'Connect a Stellar wallet',
    );
  });

  it('nextCard requires account and decodes wire card', async () => {
    const wireCard = makeWireCard({ genre: 0 }); // HipHop
    mockContractMethods.next_card.mockResolvedValue(makeAssembled(wireCard));

    const calls = createSystemCalls(TEST_CONFIG, TEST_ADDRESS);
    const card = await calls.nextCard(BigInt(1));

    expect(card.genre).toBe('HipHop');
  });

  it('nextCardWithMeta reports the ledger close time of the card draw', async () => {
    const wireCard = makeWireCard({ genre: 1 });
    mockContractMethods.next_card.mockResolvedValue(
      makeAssembled(wireCard, undefined, { createdAt: 1_800_000_000, ledger: 42 }),
    );

    const calls = createSystemCalls(TEST_CONFIG, TEST_ADDRESS);
    const { result, startedAtMs, closedAtMs } = await calls.nextCardWithMeta(BigInt(1));

    expect(result.genre).toBe('Pop');
    expect(closedAtMs).toBe(1_800_000_000_000);
    expect(startedAtMs).toBe(1_800_000_000_000);
  });

  it('submitAnswerWithMeta reports the ledger close time of the submission', async () => {
    mockContractMethods.submit_answer.mockResolvedValue(
      makeAssembled(false, undefined, { createdAt: 1_800_000_020, ledger: 45 }),
    );
    const { Answer } = await import('@/lib/stellar/types');

    const calls = createSystemCalls(TEST_CONFIG, TEST_ADDRESS);
    const { result, closedAtMs } = await calls.submitAnswerWithMeta(
      BigInt(1),
      Answer.title('Thriller'),
    );

    expect(result).toBe(false);
    expect(closedAtMs).toBe(1_800_000_020_000);
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

  it('claimEarnings is a legacy alias for claimWinnings', async () => {
    const calls = createSystemCalls(TEST_CONFIG, null);
    await expect(calls.claimEarnings(BigInt(1))).rejects.toThrow(
      'Connect a Stellar wallet before performing this action.',
    );
  });
});

// ---------------------------------------------------------------------------
// Client caching (LF-189)
// ---------------------------------------------------------------------------
describe('contract client caching (LF-189)', () => {
  it('memoizes contract.Client.from across repeated calls for the same wallet', async () => {
    mockContractMethods.get_cards_count.mockResolvedValue(makeAssembled(BigInt(10)));
    mockContractMethods.get_max_players.mockResolvedValue(makeAssembled(4));

    const calls = createSystemCalls(TEST_CONFIG, TEST_ADDRESS);

    await calls.getCardsCount();
    await calls.getMaxPlayers();
    await calls.getCardsCount();

    expect(contract.Client.from).toHaveBeenCalledTimes(1);
    expect(contract.Client.from).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: TEST_CONFIG.lyricsflipContractId,
        publicKey: TEST_ADDRESS,
        rpcUrl: TEST_CONFIG.rpcUrl,
        networkPassphrase: TEST_CONFIG.networkPassphrase,
      }),
    );
  });

  it('creates a new client when the wallet account changes', async () => {
    mockContractMethods.get_cards_count.mockResolvedValue(makeAssembled(BigInt(10)));
    const SECOND_ADDRESS = 'GSECONDACCOUNT1234567890TEST';

    const calls1 = createSystemCalls(TEST_CONFIG, TEST_ADDRESS);
    const calls2 = createSystemCalls(TEST_CONFIG, SECOND_ADDRESS);

    await calls1.getCardsCount();
    await calls2.getCardsCount();

    expect(contract.Client.from).toHaveBeenCalledTimes(2);
    expect(contract.Client.from).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ publicKey: TEST_ADDRESS }),
    );
    expect(contract.Client.from).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ publicKey: SECOND_ADDRESS }),
    );
  });

  it('clearGameClientCache invalidates the cache and forces a re-instantiation', async () => {
    mockContractMethods.get_cards_count.mockResolvedValue(makeAssembled(BigInt(10)));

    const calls = createSystemCalls(TEST_CONFIG, TEST_ADDRESS);

    await calls.getCardsCount();
    expect(contract.Client.from).toHaveBeenCalledTimes(1);

    clearGameClientCache();

    await calls.getCardsCount();
    expect(contract.Client.from).toHaveBeenCalledTimes(2);
  });

  it('evicts rejected client instantiation from cache so subsequent calls can retry', async () => {
    (contract.Client.from as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error during spec fetch'))
      .mockResolvedValue(mockContractMethods);

    mockContractMethods.get_cards_count.mockResolvedValue(makeAssembled(BigInt(10)));

    const calls = createSystemCalls(TEST_CONFIG, TEST_ADDRESS);

    await expect(calls.getCardsCount()).rejects.toThrow('Network error during spec fetch');

    // Next call should retry and not return the cached rejected promise
    const count = await calls.getCardsCount();
    expect(count).toBe(BigInt(10));
    expect(contract.Client.from).toHaveBeenCalledTimes(2);
  });
});

