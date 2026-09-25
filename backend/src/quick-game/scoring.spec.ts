import { scoreAnswer } from './scoring';

describe('scoreAnswer', () => {
  const base = { basePoints: 100, timeLimitMs: 10_000 };

  it('gives nothing for a wrong answer', () => {
    expect(scoreAnswer({ ...base, correct: false, responseTimeMs: 1_000 })).toBe(0);
  });

  it('gives nothing for a correct answer after the time limit', () => {
    expect(scoreAnswer({ ...base, correct: true, responseTimeMs: 10_001 })).toBe(0);
  });

  it('adds a speed bonus of up to 50%', () => {
    expect(scoreAnswer({ ...base, correct: true, responseTimeMs: 0 })).toBe(150);
    expect(scoreAnswer({ ...base, correct: true, responseTimeMs: 5_000 })).toBe(125);
    expect(scoreAnswer({ ...base, correct: true, responseTimeMs: 10_000 })).toBe(100);
  });
});
