import { Question } from './entities/question.entity';

/** What players may see of a question: never the answer or its stats. */
export type PublicQuestion = Omit<Question, 'correctAnswer' | 'timesUsed' | 'correctAnswers'>;

export function toPublicQuestion(question: Question): PublicQuestion {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { correctAnswer, timesUsed, correctAnswers, ...rest } = question;
  return rest;
}
