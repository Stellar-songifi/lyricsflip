import type { Metadata } from 'next';
import { GAME_RULE_CONSTANTS as C } from '@/lib/game-rules.constants';

export const metadata: Metadata = {
  title: 'How to play · LyricsFlip',
  description: 'Round rules, timing and scoring for LyricsFlip.',
};

/** Points for a correct answer at a given elapsed time, before difficulty. */
function basePoints(elapsedSeconds: number): number {
  const overGrace = Math.max(elapsedSeconds - C.FIRST_LEDGER_GRACE_SECONDS, 0);
  return Math.max(C.MAX_CORRECT_POINTS - overGrace * C.POINTS_DECAY_PER_SECOND, C.MIN_CORRECT_POINTS);
}

export default function HowToPlayPage() {
  const roundMinutes = C.DEFAULT_ROUND_DURATION_SECONDS / 60;
  const lobbyMinutes = C.LOBBY_TIMEOUT_SECONDS / 60;

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <h1 className="text-3xl font-bold">How to play</h1>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Rounds</h2>
        <p>
          A round holds 1 to {C.DEFAULT_MAX_PLAYERS} players. One player makes a solo practice round;
          two or more players compete in the same round.
        </p>
        <p>Each round lasts {roundMinutes} minutes by default.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Answering</h2>
        <p>
          Each card gives you {C.CARD_ANSWER_WINDOW_SECONDS} seconds to answer by default. An answer
          after the window is recorded but scores zero.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Scoring</h2>
        <p>
          A correct answer earns up to {C.MAX_CORRECT_POINTS} points. The first{' '}
          {C.FIRST_LEDGER_GRACE_SECONDS} seconds are free of decay; after that you lose{' '}
          {C.POINTS_DECAY_PER_SECOND} points per second, down to a floor of {C.MIN_CORRECT_POINTS}.
        </p>
        <p>
          Each card has a difficulty from 1 to 3, and the points are multiplied by it. For example, a
          correct answer at 10 seconds on a difficulty-2 card earns{' '}
          {basePoints(10) * 2} points.
        </p>
        <p>Incorrect or missing answers score zero. Streaks do not change the points you earn.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Lobby</h2>
        <p>
          A round that has not started can be cancelled by anyone after {lobbyMinutes} minutes. You can
          keep at most {C.MAX_OPEN_ROUNDS_PER_ADDRESS} public lobby rounds open at once.
        </p>
      </section>

      <p className="text-sm text-muted-foreground">
        Full rules, including winner selection and payouts, are in <code>docs/game-rules.md</code>.
      </p>
    </main>
  );
}
