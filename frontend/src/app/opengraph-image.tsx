import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "LyricsFlip — A decentralized lyrics game";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
          padding: "80px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 120,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          LyricsFlip
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 32,
            fontSize: 44,
            fontWeight: 400,
            color: "#c7c3ff",
            maxWidth: 900,
            lineHeight: 1.3,
          }}
        >
          A decentralized lyrics game
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 64,
            fontSize: 28,
            fontWeight: 500,
            color: "#8f8ad6",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Flip · Guess · Earn
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}