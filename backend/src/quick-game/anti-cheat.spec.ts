import {
  AntiCheatFlag,
  detectFlags,
  MIN_HUMAN_RESPONSE_MS,
  SUSPICIOUS_STREAK_LENGTH,
} from './anti-cheat';

const answers = (n: number, correct: boolean, responseTimeMs: number) =>
  Array.from({ length: n }, () => ({ correct, responseTimeMs }));

describe('detectFlags', () => {
  it('flags nothing for normal play', () => {
    expect(detectFlags([...answers(5, true, 3_000), ...answers(2, false, 4_000)])).toEqual([]);
  });

  it('flags a correct answer faster than a human can respond', () => {
    expect(detectFlags(answers(1, true, MIN_HUMAN_RESPONSE_MS - 1))).toContain(
      AntiCheatFlag.IMPOSSIBLE_RESPONSE_TIME,
    );
  });

  it('does not flag fast wrong answers as impossible', () => {
    expect(detectFlags(answers(1, false, 50))).toEqual([]);
  });

  it('flags a long, fast, perfect streak', () => {
    expect(detectFlags(answers(SUSPICIOUS_STREAK_LENGTH, true, 900))).toEqual([
      AntiCheatFlag.PERFECT_STREAK,
    ]);
  });

  it('does not flag a perfect streak at human speed', () => {
    expect(detectFlags(answers(SUSPICIOUS_STREAK_LENGTH * 2, true, 4_000))).toEqual([]);
  });

  it('resets the streak on a wrong answer', () => {
    const history = [
      ...answers(SUSPICIOUS_STREAK_LENGTH - 1, true, 900),
      ...answers(1, false, 900),
      ...answers(SUSPICIOUS_STREAK_LENGTH - 1, true, 900),
    ];
    expect(detectFlags(history)).toEqual([]);
  });
});
