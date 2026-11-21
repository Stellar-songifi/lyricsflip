/**
 * Server layout for /round/[roundId].
 *
 * Generates Twitter card and OpenGraph metadata server-side so that link
 * previews on X/Twitter and Discord pick up the round's real genre, winner,
 * and score via the opengraph-image route handler.
 *
 * The page itself is a client component (useParams, useEffect); the layout
 * is a server component so metadata can be generated here without breaking
 * the client boundary.
 *
 * Part of Issue #906 / LF-320.
 */
import type { Metadata } from "next";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://lyricsflip.xyz";

export async function generateMetadata({
  params,
}: {
  params: { roundId: string };
}): Promise<Metadata> {
  const { roundId } = params;

  // Try to fetch real round data for a richer description; fall back
  // gracefully so the layout never throws.
  let description = `See the results for LyricsFlip round ${roundId}.`;
  let title = "Round Results | LyricsFlip";

  try {
    const res = await fetch(`${APP_URL}/api/rounds/${roundId}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        score?: number;
        genre?: string;
        rank?: number;
        winner?: string;
      };
      const score = data.score ?? 0;
      const genre = data.genre ?? "Unknown";
      const rank = data.rank ?? 0;
      title = `${score} pts in ${genre} | LyricsFlip`;
      description = `Scored ${score} points in ${genre}${rank > 0 ? `, ranked #${rank}` : ""}. Play LyricsFlip!`;
    }
  } catch {
    // Ignore — fall back to defaults above
  }

  const ogImageUrl = `${APP_URL}/round/${roundId}/opengraph-image`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${APP_URL}/round/${roundId}`,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: description,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function RoundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
