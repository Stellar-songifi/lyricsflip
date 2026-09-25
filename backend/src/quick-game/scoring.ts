/** Fraction of the base points a correct answer can earn purely for speed. */
export const MAX_SPEED_BONUS = 0.5;

/**
 * Points for one answer. Wrong or late answers earn nothing; a correct answer
 * earns the question's base points plus up to 50% for answering quickly.
 */
export function scoreAnswer(params: {
  correct: boolean;
  basePoints: number;
  responseTimeMs: number;
  timeLimitMs: number;
}): number {
  const { correct, basePoints, responseTimeMs, timeLimitMs } = params;
  if (!correct || timeLimitMs <= 0 || responseTimeMs > timeLimitMs) return 0;
  const remaining = 1 - Math.max(0, responseTimeMs) / timeLimitMs;
  return Math.round(basePoints * (1 + MAX_SPEED_BONUS * remaining));
}
