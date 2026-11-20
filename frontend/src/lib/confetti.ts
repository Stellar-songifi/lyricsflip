/**
 * fireConfetti
 *
 * Fires a burst of canvas-confetti for a correct answer.
 * Skips the animation entirely when the user has requested reduced motion.
 *
 * Safe to call unconditionally: it is a no-op under reduced motion, and the
 * dynamic import of `canvas-confetti` is skipped entirely in that case.
 *
 * Part of Issue #472 / LF-055, updated for Issue #696 / LF-210.
 */

/**
 * prefersReducedMotion
 *
 * Returns `true` when the user has requested reduced motion via
 * `prefers-reduced-motion: reduce`. Safe to call in non-browser environments
 * (returns `false` when `window`/`matchMedia` is unavailable).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * fireConfetti
 *
 * Fires a burst of canvas-confetti for a correct answer.
 * Skips the animation entirely when the user has requested reduced motion.
 *
 * @param options.reducedMotion Optional override for the reduced-motion check.
 *   When omitted, {@link prefersReducedMotion} is consulted. Callers that have
 *   already determined the preference can pass it in to avoid a redundant
 *   `matchMedia` lookup.
 */
export async function fireConfetti(
  options: { reducedMotion?: boolean } = {},
): Promise<void> {
  // Respect prefers-reduced-motion (no-op, and skip the dynamic import)
  const reducedMotion = options.reducedMotion ?? prefersReducedMotion();
  if (reducedMotion) {
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