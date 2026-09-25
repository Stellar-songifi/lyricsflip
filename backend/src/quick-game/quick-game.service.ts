import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Question } from '../questions/entities/question.entity';
import { QuestionsService } from '../questions/questions.service';
import { PublicQuestion, toPublicQuestion } from '../questions/public-question';
import { AnswerRecord, AntiCheatFlag, detectFlags } from './anti-cheat';
import { scoreAnswer } from './scoring';

interface Round {
  id: string;
  playerId: string;
  questions: Question[];
  /** Index of the question currently being answered. */
  cursor: number;
  /** Server time the current question was served; null until served. */
  servedAt: number | null;
  history: AnswerRecord[];
  score: number;
  flags: AntiCheatFlag[];
}

export interface AnswerResult {
  correct: boolean;
  correctAnswer: number;
  pointsAwarded: number;
  responseTimeMs: number;
  score: number;
  flags: AntiCheatFlag[];
  finished: boolean;
}

/**
 * Off-chain Quick Game rounds. Questions go out one at a time and without
 * answers; the server stamps when each was served, validates the answer and
 * computes the score, so the client never decides either.
 */
@Injectable()
export class QuickGameService {
  private readonly logger = new Logger(QuickGameService.name);
  private readonly rounds = new Map<string, Round>();

  constructor(
    private readonly questionsService: QuestionsService,
    private readonly now: () => number = Date.now,
  ) {}

  async startRound(playerId: string, difficulty: number, count: number) {
    const questions = await this.questionsService.getRandomQuestionsByDifficulty(difficulty, count);
    const round: Round = {
      id: randomUUID(),
      playerId,
      questions,
      cursor: 0,
      servedAt: null,
      history: [],
      score: 0,
      flags: [],
    };
    this.rounds.set(round.id, round);
    return { roundId: round.id, totalQuestions: questions.length };
  }

  /** Serves the current question and starts its clock. */
  nextQuestion(playerId: string, roundId: string): { index: number; question: PublicQuestion } {
    const round = this.getRound(playerId, roundId);
    if (round.cursor >= round.questions.length) {
      throw new BadRequestException('Round is finished');
    }
    // Re-requesting the same question doesn't restart its clock.
    round.servedAt ??= this.now();
    return { index: round.cursor, question: toPublicQuestion(round.questions[round.cursor]) };
  }

  async submitAnswer(
    playerId: string,
    roundId: string,
    questionId: string,
    answerIndex: number,
  ): Promise<AnswerResult> {
    const round = this.getRound(playerId, roundId);
    const question = round.questions[round.cursor];
    if (!question || round.servedAt === null) {
      throw new BadRequestException('No question is awaiting an answer');
    }
    if (question.id !== questionId) {
      throw new BadRequestException('Answer is not for the current question');
    }

    const responseTimeMs = this.now() - round.servedAt;
    const correct = answerIndex === question.correctAnswer;
    const pointsAwarded = scoreAnswer({
      correct,
      basePoints: question.points,
      responseTimeMs,
      timeLimitMs: question.timeLimit * 1000,
    });

    round.history.push({ correct, responseTimeMs });
    round.score += pointsAwarded;
    round.cursor += 1;
    round.servedAt = null;

    const flags = detectFlags(round.history);
    const newFlags = flags.filter((f) => !round.flags.includes(f));
    if (newFlags.length) {
      this.logger.warn(`Round ${round.id} flagged for player ${playerId}: ${newFlags.join(', ')}`);
    }
    round.flags = flags;

    await this.questionsService.updateStats(question.id, correct);

    return {
      correct,
      correctAnswer: question.correctAnswer,
      pointsAwarded,
      responseTimeMs,
      score: round.score,
      flags: round.flags,
      finished: round.cursor >= round.questions.length,
    };
  }

  getSummary(playerId: string, roundId: string) {
    const round = this.getRound(playerId, roundId);
    return {
      roundId: round.id,
      answered: round.history.length,
      totalQuestions: round.questions.length,
      score: round.score,
      flags: round.flags,
    };
  }

  private getRound(playerId: string, roundId: string): Round {
    const round = this.rounds.get(roundId);
    if (!round) throw new NotFoundException('Round not found');
    if (round.playerId !== playerId) throw new ForbiddenException();
    return round;
  }
}
