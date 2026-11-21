import type { Metadata } from 'next';
import LeaderboardClient from './leaderboard-client';

export const metadata: Metadata = {
  title: 'Leaderboard',
  description:
    'See the top LyricsFlip players ranked by rounds won, max streak, and total rounds. Filter the leaderboard globally, weekly, or by genre.',
  openGraph: {
    title: 'Leaderboard | LyricsFlip',
    description:
      'See the top LyricsFlip players ranked by rounds won, max streak, and total rounds. Filter the leaderboard globally, weekly, or by genre.',
    type: 'website',
    url: '/leaderboard',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Leaderboard | LyricsFlip',
    description:
      'See the top LyricsFlip players ranked by rounds won, max streak, and total rounds. Filter the leaderboard globally, weekly, or by genre.',
  },
  alternates: {
    canonical: '/leaderboard',
  },
};

export default function LeaderboardPage() {
  return <LeaderboardClient />;
}
