/**
 * /profile/[address] — Player profile and stats page (LF-058, #475)
 *
 * Shows:
 *  - Avatar (generated from address initials), username, truncated address
 *  - On-chain stats from `get_player_stat`: total rounds, rounds won,
 *    current streak, max streak, derived win rate
 *  - Edit username button (links to /set-username) when viewing own profile
 *
 * This is a server component that exports `generateMetadata` (LF-205) and
 * renders the interactive client view from `./profile-view`.
 */

import type { Metadata } from 'next';
import ProfileView from './profile-view';

// ---------------------------------------------------------------------------
// Metadata (LF-205)
// ---------------------------------------------------------------------------

/** Truncate a Stellar address: first 6 + … + last 4 chars */
const truncateAddress = (addr: string) =>
  addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

interface ProfilePageProps {
  params: Promise<{ address: string }>;
}

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const { address } = await params;
  const short = address ? truncateAddress(address) : 'Player';
  const title = `${short} | Profile`;
  const description = `View ${short}'s on-chain LyricsFlip stats — total rounds, rounds won, win rate, and streaks.`;

  return {
    title,
    description,
    alternates: { canonical: `/profile/${address}` },
    openGraph: {
      title,
      description,
      type: 'profile',
      url: `/profile/${address}`,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { address } = await params;
  return <ProfileView address={address} />;
}
