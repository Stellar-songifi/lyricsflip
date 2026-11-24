'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

const CONFETTI_COLORS = [
  '#9747FF',
  '#70E3C7',
  '#FFD166',
  '#EF476F',
  '#118AB2',
  '#06D6A0',
] as const;

interface ConfettiProps {
  /** Number of confetti pieces to render. */
  count?: number;
  /** How long the burst lasts, in milliseconds. */
  durationMs?: number;
}

/**
 * Short celebratory burst shown for a correct answer (LF-311).
 *
 * Honours `prefers-reduced-motion: reduce`: when the user has asked for less
 * motion the component renders nothing, so there is no animation to "turn off"
 * at the call site.
 */
export function Confetti({ count = 80, durationMs = 2500 }: ConfettiProps) {
  const reducedMotion = usePrefersReducedMotion();

  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        id: index,
        left: Math.random() * 100,
        delay: Math.random() * 0.3,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
        drift: (Math.random() - 0.5) * 120,
      })),
    [count],
  );

  if (reducedMotion) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      data-testid="confetti"
    >
      {pieces.map((piece) => (
        <motion.span
          key={piece.id}
          className="absolute top-0 block h-2 w-2 rounded-sm"
          style={{ left: `${piece.left}%`, backgroundColor: piece.color }}
          initial={{ y: -24, opacity: 1, rotate: piece.rotate }}
          animate={{
            y: '100vh',
            x: piece.drift,
            opacity: [1, 1, 0],
            rotate: piece.rotate + 180,
          }}
          transition={{
            duration: durationMs / 1000,
            delay: piece.delay,
            ease: 'easeIn',
          }}
        />
      ))}
    </div>
  );
}
