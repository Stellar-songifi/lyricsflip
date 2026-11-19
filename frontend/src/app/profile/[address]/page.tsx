import type { Metadata } from 'next';
import ProfileView from '../page';

interface Props {
  params: { address: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const short = `${params.address.slice(0, 6)}…${params.address.slice(-4)}`;
  return {
    title: `${short}'s Profile · LyricsFlip`,
    description: `View ${short}'s LyricsFlip stats, badges, and round history.`,
    openGraph: {
      title: `${short}'s LyricsFlip Profile`,
      description: `View ${short}'s on-chain stats, NFT badges, and round history on LyricsFlip.`,
      type: 'profile',
    },
  };
}

/** Thin wrapper – delegates rendering to the shared ProfileView component. */
export default function AddressProfilePage({ params }: Props) {
  return <ProfileView address={params.address} />;
}
