// Replaces `frontend/src/lib/dojo/typescript/contracts.gen.ts` /
// `models.gen.ts` (stale Dojo codegen tied to an older Cairo ABI that no
// longer matches `onchain/src/contracts/lyricsflip.cairo`'s actual
// interface). Since Soroban's `contract.Client.from()` fetches the deployed
// contract's spec at runtime, no code generation step is needed here: each
// method below just calls through with the same argument names as the Rust
// contract (see `onchain/contracts/lyricsflip/src/lib.rs`).

import { contract } from '@stellar/stellar-sdk';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import type { StellarConfig } from './stellarConfig';
import { withTxToast } from './toast';
import {
  type Answer,
  type Card,
  type Genre,
  type Milestone,
  type PlayerStats,
  type QuestionCard,
  type QuestionKind,
  type Round,
  type WireCard,
  type WireRound,
  ROLE_ADMIN,
  genreFromWire,
  genreToWire,
  questionKindToWire,
} from './types';

export interface SystemCalls {
  createRound: (genre: Genre, seed?: bigint) => Promise<bigint>;
  joinRound: (roundId: bigint) => Promise<void>;
  startRound: (roundId: bigint) => Promise<void>;
  nextCard: (roundId: bigint) => Promise<Card>;
  submitAnswer: (roundId: bigint, answer: Answer) => Promise<boolean>;
  addCard: (card: Omit<Card, 'card_id'>) => Promise<void>;
  /** Adds up to `MAX_CARDS_PER_BATCH` (20) cards in one transaction. */
  addCards: (cards: Omit<Card, 'card_id'>[]) => Promise<bigint[]>;
  getCard: (cardId: bigint) => Promise<Card>;
  getCardsCount: () => Promise<bigint>;
  setCardsPerRound: (value: number) => Promise<void>;
  setRole: (recipient: string, isEnable: boolean) => Promise<void>;
  isAdmin: (address: string) => Promise<boolean>;
  isOwner: (address: string) => Promise<boolean>;
  isRoundPlayer: (roundId: bigint, address: string) => Promise<boolean>;
  getRound: (roundId: bigint) => Promise<Round>;
  getRoundCards: (roundId: bigint) => Promise<bigint[]>;
  getRoundPlayers: (roundId: bigint) => Promise<string[]>;
  getPlayerStat: (address: string) => Promise<PlayerStats>;
  getCardsOfGenre: (genre: Genre, seed?: bigint) => Promise<Card[]>;
  getCardsOfArtist: (artist: string, seed?: bigint) => Promise<Card[]>;
  getCardsOfAYear: (year: bigint | number, seed?: bigint) => Promise<Card[]>;
  buildQuestionCard: (card: Card, kind: QuestionKind, seed?: bigint) => Promise<QuestionCard>;
  /**
   * Mints the NFT for a reached milestone to the connected wallet. The game
   * contract mints via a cross-contract call (it is the NFT minter), so
   * wallets never call the NFT contract's `mint` directly.
   */
  claimReward: (milestone: Milestone) => Promise<bigint>;
  /**
   * `getCategories`, `getSongs`, `getLeaderboard`, and `claimEarnings` were
   * already referenced by some UI components on the Starknet/Dojo version of
   * this app despite never being part of the on-chain `ILyricsFlip`
   * interface there either — they look like they belong to a future backend
   * API, not the contract. They're intentionally left as explicit
   * "not implemented" stubs here rather than invented as part of a chain
   * migration.
   */
  getCategories: () => Promise<any>;
  getSongs: () => Promise<any>;
  getLeaderboard: () => Promise<any>;
  claimEarnings: () => Promise<any>;
}

const randomSeed = () => BigInt(Date.now());

const notImplemented =
  (name: string) =>
  async (): Promise<any> => {
    throw new Error(`${name} is not implemented on-chain; wire this to a backend API.`);
  };

function makeSignTransaction(defaultNetworkPassphrase: string) {
  return async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) => {
    const { signedTxXdr, signerAddress } = await StellarWalletsKit.signTransaction(xdr, {
      networkPassphrase: opts?.networkPassphrase ?? defaultNetworkPassphrase,
      address: opts?.address,
    });
    return { signedTxXdr, signerAddress };
  };
}

type LyricsFlipContract = {
  create_round: (args: { caller: string; genre: number; seed: bigint }) => Promise<contract.AssembledTransaction<bigint>>;
  join_round: (args: { caller: string; round_id: bigint }) => Promise<contract.AssembledTransaction<null>>;
  start_round: (args: { caller: string; round_id: bigint }) => Promise<contract.AssembledTransaction<null>>;
  next_card: (args: { round_id: bigint }) => Promise<contract.AssembledTransaction<WireCard>>;
  submit_answer: (args: {
    caller: string;
    round_id: bigint;
    answer: Answer;
  }) => Promise<contract.AssembledTransaction<boolean>>;
  add_card: (args: { caller: string; card: WireCard }) => Promise<contract.AssembledTransaction<null>>;
  add_cards: (args: { caller: string; cards: WireCard[] }) => Promise<contract.AssembledTransaction<bigint[]>>;
  get_card: (args: { card_id: bigint }) => Promise<contract.AssembledTransaction<WireCard>>;
  get_cards_count: () => Promise<contract.AssembledTransaction<bigint>>;
  set_cards_per_round: (args: { caller: string; value: number }) => Promise<contract.AssembledTransaction<null>>;
  set_role: (args: {
    caller: string;
    recipient: string;
    role: number;
    is_enable: boolean;
  }) => Promise<contract.AssembledTransaction<null>>;
  is_admin: (args: { role: number; address: string }) => Promise<contract.AssembledTransaction<boolean>>;
  get_round: (args: { round_id: bigint }) => Promise<contract.AssembledTransaction<WireRound>>;
  get_round_cards: (args: { round_id: bigint }) => Promise<contract.AssembledTransaction<bigint[]>>;
  get_round_players: (args: { round_id: bigint }) => Promise<contract.AssembledTransaction<string[]>>;
  get_player_stat: (args: { player: string }) => Promise<contract.AssembledTransaction<PlayerStats>>;
  get_cards_of_genre: (args: { genre: number; seed: bigint }) => Promise<contract.AssembledTransaction<WireCard[]>>;
  get_cards_of_artist: (args: { artist: string; seed: bigint }) => Promise<contract.AssembledTransaction<WireCard[]>>;
  get_cards_of_a_year: (args: { year: bigint; seed: bigint }) => Promise<contract.AssembledTransaction<WireCard[]>>;
  build_question_card: (args: { card: WireCard; seed: bigint; kind: number }) => Promise<contract.AssembledTransaction<QuestionCard>>;
  claim_reward: (args: { caller: string; milestone: number }) => Promise<contract.AssembledTransaction<bigint>>;
};

async function getGameClient(config: StellarConfig, publicKey: string | null) {
  return contract.Client.from<LyricsFlipContract>({
    contractId: config.lyricsflipContractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    publicKey: publicKey ?? undefined,
    signTransaction: makeSignTransaction(config.networkPassphrase),
  });
}

const cardFromWire = (card: WireCard): Card => ({ ...card, genre: genreFromWire(card.genre) });
const cardToWire = (card: Omit<Card, 'card_id'>): WireCard => ({
  ...card,
  card_id: BigInt(0),
  genre: genreToWire(card.genre),
});
const roundFromWire = (round: WireRound): Round => ({ ...round, genre: genreFromWire(round.genre) });

export function createSystemCalls(config: StellarConfig, publicKey: string | null): SystemCalls {
  /** Signs + submits a mutating call (with toast feedback) and returns its decoded result. */
  const submit = <T>(build: () => Promise<contract.AssembledTransaction<T>>) =>
    withTxToast(build, config.networkPassphrase);

  const requireAccount = (): string => {
    if (!publicKey) {
      throw new Error('Connect a Stellar wallet before performing this action.');
    }
    return publicKey;
  };

  return {
    createRound: async (genre, seed = randomSeed()) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      return submit(() => client.create_round({ caller, genre: genreToWire(genre), seed }));
    },

    joinRound: async (roundId) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.join_round({ caller, round_id: roundId }));
    },

    startRound: async (roundId) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.start_round({ caller, round_id: roundId }));
    },

    nextCard: async (roundId) => {
      // `next_card` has no `caller`/auth requirement on-chain, but it still
      // mutates round state, so it must be signed & submitted (not just
      // simulated) by a connected, fee-paying account.
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      const wireCard = await submit(() => client.next_card({ round_id: roundId }));
      return cardFromWire(wireCard);
    },

    submitAnswer: async (roundId, answer) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      return submit(() => client.submit_answer({ caller, round_id: roundId, answer }));
    },

    addCard: async (card) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.add_card({ caller, card: cardToWire(card) }));
    },

    addCards: async (cards) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      return submit(() => client.add_cards({ caller, cards: cards.map(cardToWire) }));
    },

    getCard: async (cardId) => {
      const client = await getGameClient(config, publicKey);
      const assembled = await client.get_card({ card_id: cardId });
      return cardFromWire(assembled.result);
    },

    getCardsCount: async () => {
      const client = await getGameClient(config, publicKey);
      const assembled = await client.get_cards_count();
      return assembled.result;
    },

    setCardsPerRound: async (value) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.set_cards_per_round({ caller, value }));
    },

    setRole: async (recipient, isEnable) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.set_role({ caller, recipient, role: ROLE_ADMIN, is_enable: isEnable }));
    },

    isOwner: async (address) => {
      // There is no owner getter on-chain, but `set_role` rejects every caller
      // except the owner, so a successful dry-run simulation identifies them.
      try {
        const client = await getGameClient(config, address);
        const assembled = await client.set_role({
          caller: address,
          recipient: address,
          role: ROLE_ADMIN,
          is_enable: true,
        });
        void assembled.result;
        return true;
      } catch {
        return false;
      }
    },

    isAdmin: async (address) => {
      const client = await getGameClient(config, publicKey);
      const assembled = await client.is_admin({ role: ROLE_ADMIN, address });
      return assembled.result;
    },

    isRoundPlayer: async (roundId, address) => {
      const client = await getGameClient(config, publicKey);
      const assembled = await client.get_round_players({ round_id: roundId });
      return assembled.result.includes(address);
    },

    getRound: async (roundId) => {
      const client = await getGameClient(config, publicKey);
      const assembled = await client.get_round({ round_id: roundId });
      return roundFromWire(assembled.result);
    },

    getRoundCards: async (roundId) => {
      const client = await getGameClient(config, publicKey);
      const assembled = await client.get_round_cards({ round_id: roundId });
      return assembled.result;
    },

    getRoundPlayers: async (roundId) => {
      const client = await getGameClient(config, publicKey);
      const assembled = await client.get_round_players({ round_id: roundId });
      return assembled.result;
    },

    getPlayerStat: async (address) => {
      const client = await getGameClient(config, publicKey);
      const assembled = await client.get_player_stat({ player: address });
      return assembled.result;
    },

    getCardsOfGenre: async (genre, seed = randomSeed()) => {
      const client = await getGameClient(config, publicKey);
      const assembled = await client.get_cards_of_genre({ genre: genreToWire(genre), seed });
      return assembled.result.map(cardFromWire);
    },

    getCardsOfArtist: async (artist, seed = randomSeed()) => {
      const client = await getGameClient(config, publicKey);
      const assembled = await client.get_cards_of_artist({ artist, seed });
      return assembled.result.map(cardFromWire);
    },

    getCardsOfAYear: async (year, seed = randomSeed()) => {
      const client = await getGameClient(config, publicKey);
      const assembled = await client.get_cards_of_a_year({ year: BigInt(year), seed });
      return assembled.result.map(cardFromWire);
    },

    buildQuestionCard: async (card, kind, seed = randomSeed()) => {
      const client = await getGameClient(config, publicKey);
      const assembled = await client.build_question_card({
        card: cardToWire(card),
        seed,
        kind: questionKindToWire(kind),
      });
      return assembled.result;
    },

    claimReward: async (milestone) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      return submit(() => client.claim_reward({ caller, milestone }));
    },

    getCategories: notImplemented('getCategories'),
    getSongs: notImplemented('getSongs'),
    getLeaderboard: notImplemented('getLeaderboard'),
    claimEarnings: notImplemented('claimEarnings'),
  };
}
