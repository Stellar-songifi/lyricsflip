import { Injectable } from '@nestjs/common';

export interface QuestionCard {
  cardIndex: number;
  lyric: string;
  kind: string;
  options: string[];
}

export interface RevealedCard {
  cardIndex: number;
  title: string;
  artist: string;
  year: number;
}

export interface RoundCard {
  cardIndex: number;
  lyric: string;
  kind: string;
  options: string[];
  answerHash?: string;
  salt?: string;
  title?: string;
  artist?: string;
  year?: number;
  revealed?: boolean;
}

export interface RoundState {
  roundId: number;
  active: boolean;
  finalized: boolean;
  cards: RoundCard[];
  answersByPlayer: Map<string, Map<number, number>>;
}

export interface PlayerState {
  id: string;
  score: number;
  currentCardIndex: number;
}

export interface GameState {
  rounds: Map<number, RoundState>;
  admins: Set<string>;
}

@Injectable()
export class GameService {
  private gameState: GameState;
  private players: Map<string, PlayerState>;

  constructor() {
    this.gameState = { rounds: new Map(), admins: new Set() };
    this.players = new Map();
  }

  updateGameState(newState: GameState): void {
    this.gameState = newState;
  }

  getGameState(): GameState {
    return this.gameState;
  }

  addPlayer(playerId: string, playerData: PlayerState): void {
    this.players.set(playerId, playerData);
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
  }

  getPlayer(playerId: string): PlayerState | undefined {
    return this.players.get(playerId);
  }

  synchronizeTimer(time: number): void {
    // Logic to synchronize the game timer
  }

  updateScore(playerId: string, score: number): void {
    const player = this.players.get(playerId);
    if (player) {
      player.score = score;
    }
  }

  getScores(): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const [playerId, player] of this.players) {
      scores[playerId] = player.score;
    }
    return scores;
  }

  private isAdmin(caller: string): boolean {
    return this.gameState.admins.has(caller);
  }

  private getRound(roundId: number): RoundState {
    const round = this.gameState.rounds.get(roundId);
    if (!round) {
      throw new Error(`Round ${roundId} not found`);
    }
    return round;
  }

  private hasAnswered(roundId: number, caller: string, cardIndex: number): boolean {
    const round = this.getRound(roundId);
    const answers = round.answersByPlayer.get(caller);
    return answers ? answers.has(cardIndex) : false;
  }

  /**
   * Returns only the lyric, kind, and options for the caller's current card.
   * The answer fields (title, artist, year) are never included.
   */
  getQuestion(caller: string, roundId: number): QuestionCard {
    const round = this.getRound(roundId);
    const player = this.players.get(caller);
    if (!player) {
      throw new Error(`Player ${caller} not found`);
    }
    const cardIndex = player.currentCardIndex;
    const card = round.cards[cardIndex];
    if (!card) {
      throw new Error(`Card ${cardIndex} not found in round ${roundId}`);
    }
    return {
      cardIndex,
      lyric: card.lyric,
      kind: card.kind,
      options: card.options,
    };
  }

  /**
   * Returns the caller's current card as a question card.
   * Replaces the old `next_card` behaviour that leaked the answer.
   */
  nextCard(caller: string, roundId: number): QuestionCard {
    return this.getQuestion(caller, roundId);
  }

  /**
   * Admin-only during an active round; public once the round is finalized.
   */
  getCard(caller: string, roundId: number, cardIndex: number): RoundCard {
    const round = this.getRound(roundId);
    if (!round.finalized && !this.isAdmin(caller)) {
      throw new Error('getCard is restricted to admins while the round is active');
    }
    const card = round.cards[cardIndex];
    if (!card) {
      throw new Error(`Card ${cardIndex} not found in round ${roundId}`);
    }
    return card;
  }

  /**
   * Admin-only during an active round; public once the round is finalized.
   */
  getRoundCards(caller: string, roundId: number): RoundCard[] {
    const round = this.getRound(roundId);
    if (!round.finalized && !this.isAdmin(caller)) {
      throw new Error('getRoundCards is restricted to admins while the round is active');
    }
    return round.cards;
  }

  /**
   * Reveals the answer for a card only after the caller has answered it
   * or the round has been finalized.
   */
  getReveal(caller: string, roundId: number, cardIndex: number): RevealedCard {
    const round = this.getRound(roundId);
    if (!round.finalized && !this.hasAnswered(roundId, caller, cardIndex)) {
      throw new Error('Cannot reveal a card the caller has not answered yet');
    }
    const card = round.cards[cardIndex];
    if (!card || card.title === undefined || card.artist === undefined || card.year === undefined) {
      throw new Error(`Answer for card ${cardIndex} is not available`);
    }
    return {
      cardIndex,
      title: card.title,
      artist: card.artist,
      year: card.year,
    };
  }

  /**
   * Submits an answer and returns the reveal for the answered card.
   */
  submitAnswer(caller: string, roundId: number, cardIndex: number, answerIndex: number): RevealedCard {
    const round = this.getRound(roundId);
    const card = round.cards[cardIndex];
    if (!card) {
      throw new Error(`Card ${cardIndex} not found in round ${roundId}`);
    }
    let answers = round.answersByPlayer.get(caller);
    if (!answers) {
      answers = new Map();
      round.answersByPlayer.set(caller, answers);
    }
    answers.set(cardIndex, answerIndex);
    return this.getReveal(caller, roundId, cardIndex);
  }

  /**
   * Admin/oracle finalization that makes the round's answers publicly revealable.
   */
  finalizeRound(caller: string, roundId: number): void {
    if (!this.isAdmin(caller)) {
      throw new Error('Only admins or the oracle can finalize a round');
    }
    const round = this.getRound(roundId);
    round.active = false;
    round.finalized = true;
  }
}
