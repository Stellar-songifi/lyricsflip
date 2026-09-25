import { BadRequestException, ForbiddenException } from '@nestjs/common';
// The real questions stack pulls in songs, redis, etc.; only the types matter here.
jest.mock('../questions/questions.service', () => ({ QuestionsService: class {} }));

import { Question } from '../questions/entities/question.entity';
import { QuestionsService } from '../questions/questions.service';
import { AntiCheatFlag } from './anti-cheat';
import { QuickGameService } from './quick-game.service';

const question = (id: string, correctAnswer = 2): Question =>
  ({
    id,
    lyricSnippet: `lyric ${id}`,
    options: ['a', 'b', 'c', 'd'],
    correctAnswer,
    difficulty: 1,
    points: 100,
    timeLimit: 10,
    timesUsed: 0,
    correctAnswers: 0,
  }) as Question;

describe('QuickGameService', () => {
  let clock: number;
  let questionsService: jest.Mocked<Pick<QuestionsService, 'getRandomQuestionsByDifficulty' | 'updateStats'>>;
  let service: QuickGameService;

  beforeEach(() => {
    clock = 1_000_000;
    questionsService = {
      getRandomQuestionsByDifficulty: jest.fn(async (_d, count) =>
        Array.from({ length: count }, (_, i) => question(`00000000-0000-4000-8000-00000000000${i}`)),
      ),
      updateStats: jest.fn(),
    };
    service = new QuickGameService(questionsService as unknown as QuestionsService, () => clock);
  });

  it('never includes the correct answer in the question payload', async () => {
    const { roundId } = await service.startRound('p1', 1, 3);
    const served = service.nextQuestion('p1', roundId);

    expect(served.question).not.toHaveProperty('correctAnswer');
    expect(JSON.stringify(served)).not.toMatch(/correctAnswer/);
  });

  it('validates the answer and measures response time on the server', async () => {
    const { roundId } = await service.startRound('p1', 1, 2);
    const { question: q } = service.nextQuestion('p1', roundId);
    clock += 5_000;

    const result = await service.submitAnswer('p1', roundId, q.id, 2);

    expect(result).toMatchObject({
      correct: true,
      responseTimeMs: 5_000,
      pointsAwarded: 125,
      score: 125,
      finished: false,
    });
    expect(questionsService.updateStats).toHaveBeenCalledWith(q.id, true);
  });

  it('scores a wrong answer as zero', async () => {
    const { roundId } = await service.startRound('p1', 1, 1);
    const { question: q } = service.nextQuestion('p1', roundId);
    clock += 2_000;

    const result = await service.submitAnswer('p1', roundId, q.id, 0);

    expect(result).toMatchObject({ correct: false, pointsAwarded: 0, finished: true });
  });

  it('does not restart the clock when the question is re-requested', async () => {
    const { roundId } = await service.startRound('p1', 1, 1);
    const { question: q } = service.nextQuestion('p1', roundId);
    clock += 3_000;
    service.nextQuestion('p1', roundId);
    clock += 1_000;

    const result = await service.submitAnswer('p1', roundId, q.id, 2);
    expect(result.responseTimeMs).toBe(4_000);
  });

  it('rejects answering before the question is served, or answering twice', async () => {
    const { roundId } = await service.startRound('p1', 1, 2);
    const firstId = '00000000-0000-4000-8000-000000000000';
    await expect(service.submitAnswer('p1', roundId, firstId, 2)).rejects.toThrow(BadRequestException);

    service.nextQuestion('p1', roundId);
    clock += 2_000;
    await service.submitAnswer('p1', roundId, firstId, 2);
    await expect(service.submitAnswer('p1', roundId, firstId, 2)).rejects.toThrow(BadRequestException);
  });

  it("rejects another player's round", async () => {
    const { roundId } = await service.startRound('p1', 1, 1);
    expect(() => service.nextQuestion('p2', roundId)).toThrow(ForbiddenException);
  });

  it('flags impossibly fast correct answers', async () => {
    const { roundId } = await service.startRound('p1', 1, 1);
    const { question: q } = service.nextQuestion('p1', roundId);
    clock += 100;

    const result = await service.submitAnswer('p1', roundId, q.id, 2);
    expect(result.flags).toContain(AntiCheatFlag.IMPOSSIBLE_RESPONSE_TIME);
    expect(service.getSummary('p1', roundId).flags).toContain(AntiCheatFlag.IMPOSSIBLE_RESPONSE_TIME);
  });
});
