// Thin, app-friendly wrapper over the generated contract bindings in
// `./generated` (LF-296). Method signatures come from the contract spec via
// `npm run generate:bindings`; never declare them by hand here.

import type { contract } from '@stellar/stellar-sdk';
// Replaces `frontend/src/lib/dojo/typescript/contracts.gen.ts` /
// `models.gen.ts` (stale Dojo codegen tied to an older Cairo ABI that no
// longer matches `onchain/src/contracts/lyricsflip.cairo`'s actual
// interface). Since Soroban's `contract.Client.from()` fetches the deployed
// contract's spec at runtime, no code generation step is needed here: each
// method below just calls through with the same argument names as the Rust
// contract (see `onchain/contracts/lyricsflip/src/lib.rs`).

import { contract, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
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
  type CardResult,
  type Genre,
  type Milestone,
  type PlayerStats,
  type QuestionCard,
  type QuestionKind,
  type Round,
  type RoundFilter,
  type WireCard,
  type WireQuestionCard,
  type WireRound,
  type WireCardResult,
  ROLE_ADMIN,
  genreFromWire,
  genreToWire,
  questionKindFromWire,
  questionKindToWire,
  questionKindFromWire,
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

export interface NextCardResult extends TimedResult<QuestionCard> {
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

export interface OwnerConfiguration {
  answerWindow: number;
  lobbyTimeout: number;
  roundDuration: number | null;
  roundBuffer: number;
  maxPlayers: number;
  cardsPerRound: number;
  isPaused: boolean;
  nftContract: string | null;
  admins: string[];
}

export interface ConfigurationHistoryEntry {
  name: string;
  ledger: number;
  value: string;
}

export interface SystemCalls {
  /**
   * `inviteCode` makes the round private (LF-305): only its SHA-256 hash is
   * sent on-chain, and joiners must present the code itself.
   */
  createRound: (
    genre: Genre,
    seed?: bigint,
    wagerAmount?: bigint,
    inviteCode?: string,
  ) => Promise<bigint>;
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
  getOwnerConfiguration: () => Promise<OwnerConfiguration>;
  getConfigurationHistory: () => Promise<ConfigurationHistoryEntry[]>;
  setAnswerWindow: (value: number) => Promise<void>;
  setLobbyTimeout: (value: number) => Promise<void>;
  setRoundDuration: (value: number | null) => Promise<void>;
  setRoundBuffer: (value: number) => Promise<void>;
  setMaxPlayers: (value: number) => Promise<void>;
  setNftContract: (address: string) => Promise<void>;
  pause: () => Promise<void>;
  unpause: () => Promise<void>;
  /** The caller's current question in `roundId` (simulation only, no signature). */
  getQuestion: (roundId: bigint) => Promise<QuestionCard>;
  joinRound: (roundId: bigint) => Promise<void>;
  joinRound: (roundId: bigint, inviteCode?: string) => Promise<void>;
  /** Leaves a lobby you joined (non-hosts only) and refunds your stake (LF-306). */
  leaveRound: (roundId: bigint) => Promise<void>;
  /**
   * Unix seconds at which the round was created, read from its `RoundCreated`
   * event. `null` when the event is older than the lookback window, which
   * means the lobby timeout has long passed (LF-306).
   */
  getRoundCreatedAt: (roundId: bigint, lobbyTimeoutSeconds: bigint) => Promise<bigint | null>;
  startRound: (roundId: bigint) => Promise<void>;
  nextCard: (roundId: bigint) => Promise<QuestionCard>;
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
  updateCard: (cardId: bigint, card: Omit<Card, 'card_id'>) => Promise<void>;
  removeCard: (cardId: bigint) => Promise<void>;
  getCard: (cardId: bigint) => Promise<Card>;
  getCardsCount: () => Promise<bigint>;
  getCards: (start: number, limit: number) => Promise<Card[]>;
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
  /** LF-293: per-card breakdown of a finalized round, in one read. */
  getRoundSummary: (roundId: bigint) => Promise<CardResult[]>;
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
   * LF-303: calls the escrow contract's `claim_winnings`. The claim UI is
   * hidden unless `config.wageringEnabled` is true.
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
  /** Legacy alias for `claimWinnings`. */
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

/** SHA-256 of an invite code, matching the contract's `sha256(code.to_bytes())`. */
export async function hashInviteCode(code: string): Promise<Buffer> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return Buffer.from(digest);
}

/** Random URL-safe invite code for private rounds (LF-305). */
export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

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
type LyricsFlipContract = {
  create_round: (args: {
    caller: string;
    genre: number;
    seed: bigint;
    invite_hash: Buffer | null;
  }) => Promise<contract.AssembledTransaction<bigint>>;
  create_round: (args: { caller: string; genre: number }) => Promise<contract.AssembledTransaction<bigint>>;
  create_round_with_filter: (args: {
    caller: string;
    filter: { genre: number | null; decade: bigint | null };
    difficulty: number | null;
  }) => Promise<contract.AssembledTransaction<bigint>>;
  join_round: (args: {
    caller: string;
    round_id: bigint;
    invite_code: string | null;
  }) => Promise<contract.AssembledTransaction<null>>;
  leave_round: (args: { caller: string; round_id: bigint }) => Promise<contract.AssembledTransaction<null>>;
  cancel_round: (args: { caller: string; round_id: bigint }) => Promise<contract.AssembledTransaction<null>>;
  get_open_rounds: (args: {
    start: number;
    limit: number;
  }) => Promise<contract.AssembledTransaction<bigint[]>>;
  get_max_players: () => Promise<contract.AssembledTransaction<number>>;
  get_nft_contract: () => Promise<contract.AssembledTransaction<string | null>>;
  get_answer_window: () => Promise<contract.AssembledTransaction<bigint>>;
  get_lobby_timeout: () => Promise<contract.AssembledTransaction<bigint>>;
  get_round_duration: () => Promise<contract.AssembledTransaction<bigint | null>>;
  get_round_buffer: () => Promise<contract.AssembledTransaction<bigint>>;
  get_admins: () => Promise<contract.AssembledTransaction<string[]>>;
  is_paused: () => Promise<contract.AssembledTransaction<boolean>>;
  owner: () => Promise<contract.AssembledTransaction<string>>;
  set_answer_window: (args: { caller: string; value: bigint }) => Promise<contract.AssembledTransaction<null>>;
  set_lobby_timeout: (args: { caller: string; value: bigint }) => Promise<contract.AssembledTransaction<null>>;
  set_round_duration: (args: { caller: string; value: bigint | null }) => Promise<contract.AssembledTransaction<null>>;
  set_round_buffer: (args: { caller: string; value: bigint }) => Promise<contract.AssembledTransaction<null>>;
  set_max_players: (args: { caller: string; value: number }) => Promise<contract.AssembledTransaction<null>>;
  set_nft_contract: (args: { caller: string; nft_contract: string }) => Promise<contract.AssembledTransaction<null>>;
  pause: (args: { caller: string }) => Promise<contract.AssembledTransaction<null>>;
  unpause: (args: { caller: string }) => Promise<contract.AssembledTransaction<null>>;
  start_round: (args: { caller: string; round_id: bigint }) => Promise<contract.AssembledTransaction<null>>;
  next_card: (args: { caller: string; round_id: bigint }) => Promise<contract.AssembledTransaction<WireQuestionCard>>;
  submit_answer: (args: {
    caller: string;
    round_id: bigint;
    answer: Answer;
  }) => Promise<contract.AssembledTransaction<boolean>>;
  add_card: (args: { caller: string; card: WireCard }) => Promise<contract.AssembledTransaction<null>>;
  add_cards: (args: { caller: string; cards: WireCard[] }) => Promise<contract.AssembledTransaction<bigint[]>>;
  update_card: (args: { caller: string; card_id: bigint; card: WireCard }) => Promise<contract.AssembledTransaction<null>>;
  remove_card: (args: { caller: string; card_id: bigint }) => Promise<contract.AssembledTransaction<null>>;
  get_card: (args: { card_id: bigint }) => Promise<contract.AssembledTransaction<WireCard>>;
  get_cards: (args: {
    caller: string;
    start: number;
    limit: number;
  }) => Promise<contract.AssembledTransaction<WireCard[]>>;
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
  get_round_scores: (args: {
    round_id: bigint;
  }) => Promise<contract.AssembledTransaction<Map<string, bigint>>>;
  finalize_round: (args: {
    caller: string;
    round_id: bigint;
  }) => Promise<contract.AssembledTransaction<null>>;
  get_round_cards: (args: {
    caller: string;
    round_id: bigint;
  }) => Promise<contract.AssembledTransaction<bigint[]>>;
  get_round_summary: (args: {
    round_id: bigint;
  }) => Promise<contract.AssembledTransaction<WireCardResult[]>>;
  get_round_players: (args: { round_id: bigint }) => Promise<contract.AssembledTransaction<string[]>>;
  get_player_stat: (args: { player: string }) => Promise<contract.AssembledTransaction<PlayerStats>>;
  get_cards_of_genre: (args: { genre: number }) => Promise<contract.AssembledTransaction<WireCard[]>>;
  get_cards_of_artist: (args: { artist: string }) => Promise<contract.AssembledTransaction<WireCard[]>>;
  get_cards_of_a_year: (args: { year: bigint }) => Promise<contract.AssembledTransaction<WireCard[]>>;
  build_question_card: (args: { card: WireCard; kind: number }) => Promise<contract.AssembledTransaction<QuestionCard>>;
  claim_reward: (args: { caller: string; milestone: number }) => Promise<contract.AssembledTransaction<bigint>>;
  is_milestone_claimed: (args: { player: string; milestone: number }) => Promise<contract.AssembledTransaction<boolean>>;
};

type EscrowContract = {
  claim_winnings: (args: { caller: string; round_id: bigint }) => Promise<contract.AssembledTransaction<bigint>>;
};

type GameClientInstance = Awaited<ReturnType<typeof contract.Client.from<LyricsFlipContract>>>;

const gameClientCache = new Map<string, Promise<GameClientInstance>>();

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
const questionCardFromWire = (card: WireQuestionCard): QuestionCard => ({
  ...card,
  kind: questionKindFromWire(card.kind),
});
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

  /** LF-303: pays the caller's share of a settled round out of escrow. */
  const claimWinnings = async (roundId: bigint): Promise<bigint> => {
    const caller = requireAccount();
    if (!config.lyricsflipEscrowContractId) {
      throw new Error('Wagering is not enabled: no escrow contract is configured.');
    }
    const escrow = await contract.Client.from<EscrowContract>({
      contractId: config.lyricsflipEscrowContractId,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      publicKey: caller,
      signTransaction: makeSignTransaction(config.networkPassphrase),
    });
    return submit(() => escrow.claim_winnings({ caller, round_id: roundId }));
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
      result: questionCardFromWire(sent.result),
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
    // LF-304: the deployed contract has no wager parameters yet (LF-256), so
    // `_wagerAmount` cannot be forwarded; the wager UI stays behind
    // `wageringEnabled` until it can.
    createRound: async (genre, seed = randomSeed(), _wagerAmount, inviteCode) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      const invite_hash = inviteCode ? await hashInviteCode(inviteCode) : null;
      return submit(() =>
        client.create_round({ caller, genre: genreToWire(genre), seed, invite_hash }),
      );
    createRound: async (genre, _wagerAmount) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      return submit(() => client.create_round({ caller, genre: genreToWire(genre) }));
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

    getOwnerConfiguration: async () => {
      const client = await getGameClient(config, publicKey);
      const [
        answerWindow,
        lobbyTimeout,
        roundDuration,
        roundBuffer,
        maxPlayers,
        cardsPerRound,
        isPaused,
        nftContract,
        admins,
      ] = await Promise.all([
        client.get_answer_window(),
        client.get_lobby_timeout(),
        client.get_round_duration(),
        client.get_round_buffer(),
        client.get_max_players(),
        client.get_cards_per_round(),
        client.is_paused(),
        client.get_nft_contract(),
        client.get_admins(),
      ]);
      return {
        answerWindow: Number(answerWindow.result),
        lobbyTimeout: Number(lobbyTimeout.result),
        roundDuration:
          roundDuration.result == null ? null : Number(roundDuration.result),
        roundBuffer: Number(roundBuffer.result),
        maxPlayers: maxPlayers.result,
        cardsPerRound: cardsPerRound.result,
        isPaused: isPaused.result,
        nftContract: nftContract.result ?? null,
        admins: admins.result,
      };
    },

    getConfigurationHistory: async () => {
      const server = new rpc.Server(config.rpcUrl, {
        allowHttp: config.rpcUrl.startsWith('http://'),
      });
      const { sequence } = await server.getLatestLedger();
      const startLedger = Math.max(1, sequence - 10_000);
      const eventNames = [
        'answer_window_updated',
        'lobby_timeout_updated',
        'round_duration_updated',
        'round_buffer_updated',
        'cards_per_round_updated',
        'max_players_updated',
        'nft_contract_updated',
        'paused',
        'unpaused',
        'role_updated',
      ];
      const pages = await Promise.all(
        eventNames.map(async (name) => {
          const { events } = await server.getEvents({
            startLedger,
            filters: [
              {
                type: 'contract',
                contractIds: [config.lyricsflipContractId],
                topics: [[xdr.ScVal.scvSymbol(name).toXDR('base64')]],
              },
            ],
          });
          return events.map((event) => {
            const value = scValToNative(event.value);
            return {
              name,
              ledger: event.ledger,
              value:
                JSON.stringify(value, (_key, item) =>
                  typeof item === 'bigint' ? item.toString() : item,
                ) ?? String(value),
            };
          });
        }),
      );
      return pages.flat().sort((left, right) => right.ledger - left.ledger);
    },

    joinRound: async (roundId) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() =>
        client.join_round({ caller, round_id: roundId, invite_code: undefined }),
      );
          difficulty: difficulty ?? null,
        }),
      );
    },

    joinRound: async (roundId, inviteCode) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() =>
        client.join_round({ caller, round_id: roundId, invite_code: inviteCode ?? null }),
      );
    },

    leaveRound: async (roundId) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.leave_round({ caller, round_id: roundId }));
    },

    getRoundCreatedAt: async (roundId, lobbyTimeoutSeconds) => {
      const server = new rpc.Server(config.rpcUrl, {
        allowHttp: config.rpcUrl.startsWith('http://'),
      });
      const { sequence } = await server.getLatestLedger();
      // ~5 s per ledger; look back twice the timeout so a live lobby is found.
      const lookback = Number(lobbyTimeoutSeconds) * 2 / 5 + 100;
      const res = await server.getEvents({
        startLedger: Math.max(1, sequence - Math.ceil(lookback)),
        filters: [
          {
            type: 'contract',
            contractIds: [config.lyricsflipContractId],
            topics: [
              [
                xdr.ScVal.scvSymbol('round_created').toXDR('base64'),
                nativeToScVal(roundId, { type: 'u64' }).toXDR('base64'),
                '*',
              ],
            ],
          },
        ],
      });
      const event = res.events[0];
      if (!event) return null;
      const data = scValToNative(event.value) as { created_time?: bigint } | bigint;
      return typeof data === 'bigint' ? data : BigInt(data.created_time ?? 0);
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

    updateCard: async (cardId, card) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() =>
        client.update_card({ caller, card_id: cardId, card: { ...cardToWire(card), card_id: cardId } }),
      );
    },

    removeCard: async (cardId) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.remove_card({ caller, card_id: cardId }));
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

    getCards: async (start, limit) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      const res = await client.get_cards({ caller, start, limit });
      return res.result.map(cardFromWire);
    },

    setCardsPerRound: async (value) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.set_cards_per_round({ caller, value }));
    },

    setAnswerWindow: async (value) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.set_answer_window({ caller, value: BigInt(value) }));
    },

    setLobbyTimeout: async (value) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.set_lobby_timeout({ caller, value: BigInt(value) }));
    },

    setRoundDuration: async (value) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() =>
        client.set_round_duration({
          caller,
          value: value === null ? null : BigInt(value),
        }),
      );
    },

    setRoundBuffer: async (value) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.set_round_buffer({ caller, value: BigInt(value) }));
    },

    setMaxPlayers: async (value) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.set_max_players({ caller, value }));
    },

    setNftContract: async (address) => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.set_nft_contract({ caller, nft_contract: address }));
    },

    pause: async () => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.pause({ caller }));
    },

    unpause: async () => {
      const caller = requireAccount();
      const client = await getGameClient(config, caller);
      await submit(() => client.unpause({ caller }));
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
      const res = await client.owner();
      return res.result === address;
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
      const client = await getGameClient(config, publicKey);
      // LF-292: no auth needed once the round is finalized or cancelled, so
      // visitors without a wallet pass the contract id as a placeholder.
      const res = await client.get_round_cards({
        caller: publicKey ?? config.lyricsflipContractId,
        round_id: roundId,
      });
      return res.result;
    },

    getRoundSummary: async (roundId) => {
      const client = await getGameClient(config, publicKey);
      const res = await client.get_round_summary({ round_id: roundId });
      return res.result.map(({ card, kind, per_player }) => {
        const perPlayer: CardResult['perPlayer'] = {};
        per_player.forEach(([correct, points], player) => {
          perPlayer[String(player)] = { correct, points: Number(points) };
        });
        return { card: cardFromWire(card), kind, perPlayer };
      });
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
      const res = await client.get_cards_of_genre({ genre: genreToWire(genre) });
      return res.result.map(cardFromWire);
    },

    getCardsOfArtist: async (artist) => {
      const client = await getGameClient(config, publicKey);
      const res = await client.get_cards_of_artist({ artist, seed: contractSeed() });
      const res = await client.get_cards_of_artist({ artist });
      return res.result.map(cardFromWire);
    },

    getCardsOfAYear: async (year) => {
      const client = await getGameClient(config, publicKey);
      const res = await client.get_cards_of_a_year({ year: BigInt(year), seed: contractSeed() });
      const res = await client.get_cards_of_a_year({ year: BigInt(year) });
      return res.result.map(cardFromWire);
    },

    buildQuestionCard: async (card, kind) => {
      const client = await getGameClient(config, publicKey);
      const res = await client.build_question_card({
        card: cardToWire(card),
        seed: contractSeed(),
        kind: questionKindToWire(kind) as WireQuestionCard['kind'],
        kind: questionKindToWire(kind),
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
