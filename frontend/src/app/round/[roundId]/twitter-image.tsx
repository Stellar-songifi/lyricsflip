/**
 * Twitter (X) card image for round result pages.
 *
 * Next.js treats `twitter-image.tsx` as the `twitter:image` meta tag source.
 * We reuse the same data-fetch and layout as `opengraph-image.tsx` so the
 * card shown on X always reflects the round's real genre, winner, and score.
 *
 * Part of Issue #906 / LF-320.
 */
export { default, runtime, size, contentType, generateAlt } from "./opengraph-image";
