// Thin, app-friendly wrapper over the generated contract bindings in
// `./generated` (LF-296). Method signatures come from the contract spec via
// `npm run generate:bindings`; never declare them by hand here.

import type { contract } from '@stellar/stellar-sdk';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import type { StellarConfig } from './stellar-config';
import { withTxToast, withTxToastResult, type TxResult } from './toast';
import {
  Client as LyricsFlipClient,
  type AnswerResult as WireAnswerResult,
  type Card as WireCard,
  type Genre as WireGenre,
  type Milestone as WireMilestone,
  type QuestionCard as WireQuestionCard,
  type Role as WireRole,
  type Round as WireRound,
} from './generated/src';
import {
  type Answer,
  type Card,
  type Genre,
  type Milestone,
  type PlayerStats,
  type QuestionCard,
  type QuestionKind,
  type Round,
  type RoundFilter,
  ROLE_ADMIN,
  genreFromWire,
  genreToWire,
  questionKindFromWire,
  questionKindToWire,
} from './types';

/**
 * Metadata returned alongside a mutating call that the contract scores by
 * ledger time (LF-193). The ledger close time is the only clock that agrees
 * with the contract's answer window.
 */
export interface TimedResult<T> {
  result: T;
  /** Ledger close time (unix milliseconds) or `null` when unavailable. */
  closedAtMs: number | null;
}

export interface NextCardResult extends TimedResult<Card> {
  /**
   * Ledger close time (unix milliseconds) of the `next_card` transaction —
   * the moment the contract opened the 15 s answer window for this card.
   */
  startedAtMs: number;
}

export interface SoloRoundStart {
  roundId: bigint;
  question: QuestionCard;
  /** Ledger close time (unix ms) that opened the first card's answer window. */
  startedAtMs: number;
}

export interface AnswerAndNextResult extends TimedResult<boolean> {
  points: number;
  /** 1-based index of the correct option, or 0 when the contract does not report it. */
  correctOption: number;
  next: QuestionCard | null;
}

export interface SystemCalls {
  createRound: (genre: Genre, wagerAmount?: bigint) => Promise<bigint>;
  createRoundWithFilter: (
    filter: RoundFilter,
    difficulty?: number,
    wagerAmount?: bigint,
  ) => Promise<bigint>;
  /**
   * Creates and starts a solo round in one signature and returns its first
   * question (LF-163, LF-297). The answer never leaves the contract.
   */
  createSoloRound: (genre: Genre) => Promise<SoloRoundStart>;
  /**
   * Answers the current card and draws the next one in one signature
   * (LF-164). `next` is `null` when the round has no more cards.
   */
  answerAndNext: (roundId: bigint, answer: Answer) => Promise<AnswerAndNextResult>;
  getCardsPerRound: () => Promise<number>;
  /** The caller's current question in `roundId` (simulation only, no signature). */
  getQuestion: (roundId: bigint) => Promise<QuestionCard>;
  joinRound: (roundId: bigint) => Promise<void>;
  startRound: (roundId: bigint) => Promise<void>;
  nextCard: (roundId: bigint) => Promise<Card>;
  /**
   * `next_card` plus the ledger close time that started the card's on-chain
   * answer window (LF-193).
   */
  nextCardWithMeta: (roundId: bigint) => Promise<NextCardResult>;
  submitAnswer: (roundId: bigint, answer: Answer) => Promise<boolean>;
  /**
   * `submit_answer` plus the ledger close time of the submission, so the UI
   * can distinguish a late answer from a wrong one (LF-193).
   */
  submitAnswerWithMeta: (
    roundId: bigint,
    answer: Answer,
  ) => Promise<TimedResult<boolean>>;
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
  /**
   * Ids of rounds that are created but not yet started (oldest first) — the
   * contract's `get_open_rounds`. `start` is an offset into that list.
   */
  getOpenRounds: (start: number, limit: number) => Promise<bigint[]>;
  getMaxPlayers: () => Promise<number>;
  /** Cancels one of your own lobbies and refunds every participant. */
  cancelRound: (roundId: bigint) => Promise<void>;
  getRoundCards: (roundId: bigint) => Promise<bigint[]>;
  getRoundPlayers: (roundId: bigint) => Promise<string[]>;
  getPlayerStat: (address: string) => Promise<PlayerStats>;
  getCardsOfGenre: (genre: Genre) => Promise<Card[]>;
  getCardsOfArtist: (artist: string) => Promise<Card[]>;
  getCardsOfAYear: (year: bigint | number) => Promise<Card[]>;
  buildQuestionCard: (card: Card, kind: QuestionKind) => Promise<QuestionCard>;
  /**
   * Mints the NFT for a reached milestone to the connected wallet. The game
   * contract mints via a cross-contract call (it is the NFT minter), so
   * wallets never call the NFT contract's `mint` directly.
   */
  claimReward: (milestone: Milestone) => Promise<bigint>;
  /**
   * Returns whether the player has already claimed the NFT for `milestone` (LF-191).
   */
  isMilestoneClaimed: (player: string, milestone: Milestone) => Promise<boolean>;
  /**
   * LF-183: there is no `claim_winnings` on the deployed contract —
   * `create_round` always sets `wager_amount: 0`, so no pot ever accrues to
   * claim. Kept as an explicit "not implemented" stub (see `getCategories`
   * above) rather than silently removed, in case wagering comes back.
   */
  claimWinnings: (roundId: bigint) => Promise<bigint>;
  /**
   * Scores for every player in the round, as `{ address: points }`. The
   * contract's `get_round_scores` view fills in zero for players who have not
   * answered yet, so the scoreboard can render the full roster.
   */
  getRoundScores: (roundId: bigint) => Promise<Record<string, number>>;
  /**
   * Finalizes a round once every required card has been answered or the
   * round's `end_time` has passed (LF-195). Only players in the round may
   * finalize; this publishes `RoundCompleted` with the winners and scores.
   */
  finalizeRound: (roundId: bigint) => Promise<void>;
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
  /** Legacy alias for `claimWinnings` — also not implemented on-chain (LF-183). */
  claimEarnings: (roundId: bigint) => Promise<bigint>;
}

/**
 * The contract still takes a `u64` seed until LF-268 moves draws to
 * `env.prng()`. It is filled in here, never by callers, from a CSPRNG so it
 * is not predictable from the clock. Delete once the parameter is gone.
 */
const contractSeed = (): bigint => {
  const words = crypto.getRandomValues(new Uint32Array(2));
  return (BigInt(words[0]) << BigInt(32)) | BigInt(words[1]);
};

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

const gameClientCache = new Map<string, LyricsFlipClient>();

function getClientCacheKey(config: StellarConfig, publicKey: string | null): string {
  return `${config.lyricsflipContractId}:${config.rpcUrl}:${config.networkPassphrase}:${publicKey ?? ''}`;
}

/**
 * Clears the cached contract client instances (e.g. on wallet disconnect or for tests).
 */
export function clearGameClientCache(): void {
  gameClientCache.clear();
}

async function getGameClient(config: StellarConfig, publicKey: string | null) {
  const key = getClientCacheKey(config, publicKey);
  let client = gameClientCache.get(key);
  if (!client) {
    client = new LyricsFlipClient({
      contractId: config.lyricsflipContractId,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      publicKey: publicKey ?? undefined,
      signTransaction: makeSignTransaction(config.networkPassphrase),
    });
    gameClientCache.set(key, client);
  }
  return client;
}

const genreWire = (genre: Genre) => genreToWire(genre) as WireGenre;
const cardFromWire = (card: WireCard): Card => ({ ...card, genre: genreFromWire(card.genre) });
const cardToWire = (card: Omit<Card, 'card_id'>): WireCard => ({
  ...card,
  card_id: BigInt(0),
  genre: genreWire(card.genre),
});
const questionFromWire = (question: WireQuestionCard): QuestionCard => ({
  ...question,
  kind: questionKindFromWire(question.kind),
});
const roundFromWire = (round: WireRound): Round => ({ ...round, genre: genreFromWire(round.genre) });

export function createSystemCalls(config: StellarConfig, publicKey: string | null): SystemCalls {
  /**
   * Signs + submits a mutating call (with toast feedback and a balance
   * pre-check) and returns its decoded result.
   */
  const submit = <T>(build: () => Promise<contract.AssembledTransaction<T>>) =>
    withTxToast(build, config.networkPassphrase, undefined, publicKey);

  const requireAccount = (): string => {
    if (!publicKey) {
      throw new Error('Connect a Stellar wallet before performing this action.');
    }
    return publicKey;
  };

  const claimWinnings = async (_roundId: bigint): Promise<bigint> => {
    requireAccount();
    return notImplemented('claimWinnings')();
  };

  /** Signs + submits a mutating call and also reports the ledger close time. */
  const submitTimed = <T>(
    build: () => Promise<contract.AssembledTransaction<T>>,
  ): Promise<TxResult<T>> => withTxToastResult(build, config.networkPassphrase);

  const nextCardWithMeta = async (roundId: bigint): Promise<NextCardResult> => {
    const caller = requireAccount();
    const client = await getGameClient(config, caller);
    const sent = await submitTimed(() =>
      client.next_card({ caller, round_id: roundId }),
    );
    const closedAtMs =
      sent.closedAtSeconds === null ? null : sent.closedAtSeconds * 1000;
    return {
      result: cardFromWire(sent.result),
      closedAtMs,
      startedAtMs: closedAtMs ?? Date.now(),
    };
  };

  const submitAnswerWithMeta = async (
    roundId: bigint,
    answer: Answer,
  ): Promise<TimedResult<boolean>> => {
    const caller = requireAccount();
    const client = await getGameClient(config, caller);
    const sent = await submitTimed(() =>
      client.submit_answer({ caller, round_id: roundId, answer }),
    );
    return {
      result: sent.result,
      closedAtMs:
        sent.closedAtSeconds === null ? null : sent.closedAtSeconds * 1000,
    };
  };

  const createSoloRound = async (genre: Genre): Promise<SoloRoundStart> => {
    const caller = requireAccount();
    const client = await getGameClient(config, caller);
    const sent = await submitTimed(() =>
      client.create_solo_round({ caller, genre: genreWire(genre), seed: contractSeed() }),
    );
    // `create_solo_round` returns the question, not the id: round ids are
    // sequential, so walk back from the latest to the caller's new solo round.
    const latest = (await client.get_round_count()).result;
    let roundId = latest;
    for (let id = latest; id > latest - BigInt(10) && id > BigInt(0); id -= BigInt(1)) {
      const round = (await client.get_round({ round_id: id })).result;
      if (round.solo && round.admin === caller) {
        roundId = id;
        break;
      }
    }
    return {
      roundId,
      question: questionFromWire(sent.result),
      startedAtMs:
        sent.closedAtSeconds === null ? Date.now() : sent.closedAtSeconds * 1000,
    };
  };

  const answerAndNext = async (
    roundId: bigint,
    answer: Answer,
  ): Promise<AnswerAndNextResult> => {
    const caller = requireAccount();
    const client = await getGameClient(config, caller);
    const sent = await submitTimed<WireAnswerResult>(() =>
      client.answer_and_next({ caller, round_id: roundId, choice: answer }),
    );
    const { correct, points, correct_option, next } = sent.result;
    // `next` carries the full card; only its question (a read-only
    // simulation, no signature) is handed to the UI so no answer leaks.
    const question =
      next.length > 0
        ? questionFromWire(
            (await client.get_question({ caller, round_id: roundId })).result,
          )
        : null;
    return {
      result: correct,
      points: Number(points),
      correctOption: correct_option,
      next: question,
      closedAtMs:
        sent.closedAtSeconds === null ? null : sent.closedAtSeconds * 1000,
    };
  };

  return {
    createRound: async (genre, _wagerAmount) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      return submit(() =>
        client.create_round({
          caller,
          genre: genreWire(genre),
          seed: contractSeed(),
          invite_hash: undefined,
        }),
      );
    },

    createRoundWithFilter: async (filter, difficulty, _wagerAmount) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      return submit(() =>
        client.create_round_with_filter({
          caller,
          filter: {
            genre: filter.genre === undefined ? undefined : genreWire(filter.genre),
            decade: filter.decade === undefined ? undefined : BigInt(filter.decade),
          },
          difficulty,
          seed: contractSeed(),
        }),
      );
    },

    createSoloRound,
    answerAndNext,

    getQuestion: async (roundId) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      const res = await client.get_question({ caller, round_id: roundId });
      return questionFromWire(res.result);
    },

    getCardsPerRound: async () => {
      const client = await getGameClient(config, publicKey);
      const res = await client.get_cards_per_round();
      return res.result;
    },

    joinRound: async (roundId) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() =>
        client.join_round({ caller, round_id: roundId, invite_code: undefined }),
      );
    },

    startRound: async (roundId) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.start_round({ caller, round_id: roundId }));
    },

    nextCard: async (roundId) => {
      const { result } = await nextCardWithMeta(roundId);
      return result;
    },

    nextCardWithMeta,

    submitAnswer: async (roundId, answer) => {
      const { result } = await submitAnswerWithMeta(roundId, answer);
      return result;
    },

    submitAnswerWithMeta,

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
      const card = await client.get_card({ card_id: cardId });
      return cardFromWire(card.result);
    },

    getCardsCount: async () => {
      const client = await getGameClient(config, publicKey);
      const res = await client.get_cards_count();
      return res.result;
    },

    setCardsPerRound: async (value) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.set_cards_per_round({ caller, value }));
    },

    setRole: async (recipient, isEnable) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() =>
        client.set_role({
          caller,
          recipient,
          role: ROLE_ADMIN as WireRole,
          is_enable: isEnable,
        }),
      );
    },

    isAdmin: async (address) => {
      const client = await getGameClient(config, publicKey);
      const res = await client.is_admin({ role: ROLE_ADMIN as WireRole, address });
      return res.result;
    },

    isOwner: async (address) => {
      const client = await getGameClient(config, publicKey);
      const res = await client.is_admin({ role: 0 as WireRole, address });
      return res.result;
    },

    isRoundPlayer: async (roundId, address) => {
      const client = await getGameClient(config, publicKey);
      const players = await client.get_round_players({ round_id: roundId });
      return players.result.includes(address);
    },

    getRound: async (roundId) => {
      const client = await getGameClient(config, publicKey);
      const round = await client.get_round({ round_id: roundId });
      return roundFromWire(round.result);
    },

    getOpenRounds: async (start, limit) => {
      const client = await getGameClient(config, publicKey);
      const res = await client.get_open_rounds({ start, limit });
      return res.result;
    },

    getMaxPlayers: async () => {
      const client = await getGameClient(config, publicKey);
      const res = await client.get_max_players();
      return res.result;
    },

    cancelRound: async (roundId) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.cancel_round({ caller, round_id: roundId }));
    },

    getRoundCards: async (roundId) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      const res = await client.get_round_cards({ caller, round_id: roundId });
      return res.result;
    },

    getRoundPlayers: async (roundId) => {
      const client = await getGameClient(config, publicKey);
      const res = await client.get_round_players({ round_id: roundId });
      return res.result;
    },

    getPlayerStat: async (address) => {
      const client = await getGameClient(config, publicKey);
      const res = await client.get_player_stat({ player: address });
      return res.result;
    },

    getCardsOfGenre: async (genre) => {
      const client = await getGameClient(config, publicKey);
      const res = await client.get_cards_of_genre({ genre: genreWire(genre), seed: contractSeed() });
      return res.result.map(cardFromWire);
    },

    getCardsOfArtist: async (artist) => {
      const client = await getGameClient(config, publicKey);
      const res = await client.get_cards_of_artist({ artist, seed: contractSeed() });
      return res.result.map(cardFromWire);
    },

    getCardsOfAYear: async (year) => {
      const client = await getGameClient(config, publicKey);
      const res = await client.get_cards_of_a_year({ year: BigInt(year), seed: contractSeed() });
      return res.result.map(cardFromWire);
    },

    buildQuestionCard: async (card, kind) => {
      const client = await getGameClient(config, publicKey);
      const res = await client.build_question_card({
        card: cardToWire(card),
        seed: contractSeed(),
        kind: questionKindToWire(kind) as WireQuestionCard['kind'],
      });
      return questionFromWire(res.result);
    },

    claimReward: async (milestone) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      return submit(() => client.claim_reward({ caller, milestone: milestone as WireMilestone }));
    },

    isMilestoneClaimed: async (player, milestone) => {
      const client = await getGameClient(config, publicKey);
      const res = await client.is_milestone_claimed({
        player,
        milestone: milestone as WireMilestone,
      });
      return res.result;
    },

    claimWinnings,

    getRoundScores: async (roundId) => {
      const client = await getGameClient(config, publicKey);
      const res = await client.get_round_scores({ round_id: roundId });
      const scores: Record<string, number> = {};
      res.result.forEach((points, player) => {
        scores[String(player)] = Number(points);
      });
      return scores;
    },

    finalizeRound: async (roundId) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.finalize_round({ caller, round_id: roundId }));
    },

    getCategories: notImplemented('getCategories'),
    getSongs: notImplemented('getSongs'),
    getLeaderboard: notImplemented('getLeaderboard'),
    claimEarnings: claimWinnings,
  };
}
