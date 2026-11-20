import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

type RoundResult = {
  score: number;
  genre: string;
  rank: number;
  winner?: string;
};

async function getRoundResult(roundId: string): Promise<RoundResult> {
  const fallback: RoundResult = {
    score: 0,
    genre: "Unknown",
    rank: 0,
    winner: undefined,
  };

  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "http://localhost:3000";

    const res = await fetch(`${baseUrl}/api/rounds/${roundId}`, {
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return fallback;
    }

    const data = (await res.json()) as Partial<RoundResult>;

    return {
      score: typeof data.score === "number" ? data.score : fallback.score,
      genre: typeof data.genre === "string" ? data.genre : fallback.genre,
      rank: typeof data.rank === "number" ? data.rank : fallback.rank,
      winner: typeof data.winner === "string" ? data.winner : undefined,
    };
  } catch {
    return fallback;
  }
}

/** Shortens a Stellar address to 6…4 format for display inside the OG image. */
function shortenAddress(address: string): string {
  if (!address || address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export async function generateAlt({ params }: { params: { roundId: string } }) {
  const { score, genre, rank, winner } = await getRoundResult(params.roundId);
  const winnerPart = winner ? `, won by ${shortenAddress(winner)}` : "";
  return `Round result: ${score} points in ${genre}, rank #${rank}${winnerPart}`;
}

export const alt = "LyricsFlip round result";

export default async function Image({
  params,
}: {
  params: { roundId: string };
}) {
  const { score, genre, rank, winner } = await getRoundResult(params.roundId);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px",
          background: "linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #7c3aed 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          <span>🎵 LyricsFlip</span>
          <span
            style={{
              fontSize: 28,
              fontWeight: 500,
              padding: "8px 24px",
              borderRadius: 9999,
              background: "rgba(255, 255, 255, 0.15)",
            }}
          >
            Round Results
          </span>
        </div>

        {/* Score + genre */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 16,
            }}
          >
            <span
              style={{
                fontSize: 180,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: "-0.04em",
              }}
            >
              {score}
            </span>
            <span style={{ fontSize: 56, fontWeight: 600, opacity: 0.85 }}>
              pts
            </span>
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 44,
              fontWeight: 600,
              opacity: 0.9,
            }}
          >
            {genre}
          </div>
          {winner && (
            <div
              style={{
                marginTop: 12,
                fontSize: 28,
                fontWeight: 500,
                opacity: 0.75,
                padding: "6px 20px",
                borderRadius: 9999,
                background: "rgba(255,255,255,0.12)",
              }}
            >
              🏆 {shortenAddress(winner)}
            </div>
          )}
        </div>

        {/* Rank footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 40,
            fontWeight: 700,
            padding: "20px 48px",
            borderRadius: 24,
            background: "rgba(255, 255, 255, 0.15)",
            alignSelf: "center",
          }}
        >
          {rank > 0 ? `Rank #${rank}` : "Play now on LyricsFlip"}
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}