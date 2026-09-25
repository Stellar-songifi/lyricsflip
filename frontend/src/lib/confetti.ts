/**
 * fireConfetti
 *
 * Fires a burst of canvas-confetti for a correct answer.
 * Skips the animation entirely when the user has requested reduced motion.
 *
 * Part of Issue #472 / LF-055.
 */
export async function fireConfetti(): Promise<void> {
  // Respect prefers-reduced-motion
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }

  // Lazy-load canvas-confetti so it doesn't bloat the initial bundle
  const confetti = (await import('canvas-confetti')).default;

  confetti({
    particleCount: 120,
    spread: 80,
    origin: { y: 0.6 },
    colors: ['#7c3aed', '#a78bfa', '#c4b5fd', '#f9a8d4', '#34d399'],
    disableForReducedMotion: true, // belt-and-suspenders
  });
}
