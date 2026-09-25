/**
 * Heuristics for off-chain modes, where the server has to catch what the
 * contract would otherwise enforce. Flags mark a round for review; they don't
 * block play on their own.
 */

/** Faster than a person can read a lyric snippet and pick an option. */
export const MIN_HUMAN_RESPONSE_MS = 400;
/** This many correct answers in a row, each unusually fast, looks scripted. */
export const SUSPICIOUS_STREAK_LENGTH = 10;
export const SUSPICIOUS_STREAK_AVG_MS = 1500;

export enum AntiCheatFlag {
  IMPOSSIBLE_RESPONSE_TIME = 'impossible_response_time',
  PERFECT_STREAK = 'perfect_streak',
}

export interface AnswerRecord {
  correct: boolean;
  responseTimeMs: number;
}

export function detectFlags(history: AnswerRecord[]): AntiCheatFlag[] {
  const flags: AntiCheatFlag[] = [];

  if (history.some((a) => a.correct && a.responseTimeMs < MIN_HUMAN_RESPONSE_MS)) {
    flags.push(AntiCheatFlag.IMPOSSIBLE_RESPONSE_TIME);
  }

  let streak: AnswerRecord[] = [];
  for (const answer of history) {
    streak = answer.correct ? [...streak, answer] : [];
    if (streak.length >= SUSPICIOUS_STREAK_LENGTH) {
      const window = streak.slice(-SUSPICIOUS_STREAK_LENGTH);
      const avg = window.reduce((sum, a) => sum + a.responseTimeMs, 0) / window.length;
      if (avg < SUSPICIOUS_STREAK_AVG_MS) {
        flags.push(AntiCheatFlag.PERFECT_STREAK);
        break;
      }
    }
  }

  return flags;
}
