import type { Metadata } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://lyricsflip.xyz";

const description =
  "LyricsFlip is a decentralized lyrics game where you guess song lyrics, flip tracks, and compete on-chain with players around the world.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LyricsFlip",
    template: "%s | LyricsFlip",
  },
  description,
  applicationName: "LyricsFlip",
  keywords: [
    "LyricsFlip",
    "lyrics game",
    "decentralized",
    "music",
    "blockchain",
    "web3",
  ],
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "LyricsFlip",
    description,
    type: "website",
    siteName: "LyricsFlip",
    url: siteUrl,
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "LyricsFlip — A decentralized lyrics game",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LyricsFlip",
    description,
    site: "@lyricsflip",
    creator: "@lyricsflip",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "LyricsFlip — A decentralized lyrics game",
      },
    ],
  },
};