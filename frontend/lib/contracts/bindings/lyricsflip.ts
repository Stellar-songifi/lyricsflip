import { Contract } from '@stellar/stellar-sdk-client';

export type QuestionMode = 'TitleOnly' | 'Mixed' | 'ArtistOnly' | 'YearOnly';

export interface Round {
  pot: bigint;
  status: string;
  winners: string[];
  claimed: string[];
  question_mode: QuestionMode;
}

export interface PlayerStats {
  rounds_played: number;
  rounds_won: number;
  solo_rounds_completed: number;
  solo_best_score: number;
}

export interface Config {
  owner: string;
  token: string;
  treasury: string;
  fee_bps: number;
}

export interface CreateRoundParams {
  round_id: bigint;
  pot: bigint;
  question_mode: QuestionMode;
}

export interface CreateSoloRoundParams {
  round_id: bigint;
  pot: bigint;
  question_mode: QuestionMode;
}

export interface SettleRoundParams {
  round_id: bigint;
  winners: string[];
}

export interface ClaimWinningsParams {
  caller: string;
  round_id: bigint;
}

export interface GetRoundParams {
  round_id: bigint;
}

export interface GetCardsParams {
  cards_len: number;
  amount: number;
}

/**
 * Typed bindings for the LyricsFlip contract.
 *
 * Note: no method accepts a seed. Card selection is driven by the
 * network PRNG inside the contract.
 */
export class LyricsFlipContract {
  constructor(private readonly contract: Contract) {}

  async initialize(params: {
    owner: string;
    token: string;
    treasury: string;
    fee_bps: number;
  }) {
    return this.contract.call('initialize', params);
  }

  async set_fee(params: { fee_bps: number }) {
    return this.contract.call('set_fee', params);
  }

  async set_treasury(params: { treasury: string }) {
    return this.contract.call('set_treasury', params);
  }

  async create_round(params: CreateRoundParams) {
    return this.contract.call('create_round', params);
  }

  async create_solo_round(params: CreateSoloRoundParams) {
    return this.contract.call('create_solo_round', params);
  }

  async get_player_stats(params: { player: string }) {
    return this.contract.call('get_player_stats', params);
  }

  async settle_round(params: SettleRoundParams) {
    return this.contract.call('settle_round', params);
  }

  async claim_winnings(params: ClaimWinningsParams) {
    return this.contract.call('claim_winnings', params);
  }

  async get_round(params: GetRoundParams) {
    return this.contract.call('get_round', params);
  }

  async get_cards_of_round(params: GetCardsParams) {
    return this.contract.call('get_cards_of_round', params);
  }

  async get_cards_of_player(params: GetCardsParams) {
    return this.contract.call('get_cards_of_player', params);
  }
}
