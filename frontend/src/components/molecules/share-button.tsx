'use client';

import { useState } from 'react';
import { Share } from 'lucide-react';
import { CounterBadge } from '../atoms/counter-badge';
import { Button } from '../atoms/button';

interface ShareButtonProps {
  shareCount?: number
  hugCount?: number
  onShare?: () => void
  roundId?: string
  url?: string
  title?: string
  text?: string
}

export function ShareButton({
  shareCount = 0,
  hugCount = 0,
  onShare,
  roundId,
  url,
  title,
  text,
}: ShareButtonProps) {
  const [toast, setToast] = useState<string | null>(null);

  const getShareUrl = () => {
    if (url) return url;
    if (typeof window !== 'undefined') {
      const path = roundId ? `/round/${roundId}` : window.location.pathname;
      return `${window.location.origin}${path}`;
    }
    return roundId ? `/round/${roundId}` : '';
  };

  const showToast = (message: string) => {
    setToast(message);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setToast(null), 2500);
    }
  };

  const handleShare = async () => {
    const shareUrl = getShareUrl();
    const shareTitle = title ?? 'Check out my round result on LyricsFlip';
    const shareText = text ?? 'I just finished a round on LyricsFlip!';

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        onShare?.();
        return;
      }

      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link copied to clipboard');
        onShare?.();
        return;
      }

      showToast('Sharing is not supported on this device');
    } catch (error) {
      // User cancelled the native share sheet or clipboard failed.
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      showToast('Unable to share right now');
    }
  };

  return (
    <div className="relative w-full">
      <Button
        variant="outlinePurple"
        className="flex items-center justify-between gap-2 w-full border-dashed"
        onClick={handleShare}
      >
        <div className="flex items-center gap-2">
          <Share className="h-4 w-4" />
          <span>Share</span>
        </div>
        <div className="flex items-center gap-2">
          <CounterBadge count={shareCount} label="" />
          <CounterBadge count={hugCount} label="Hug" />
        </div>
      </Button>
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/80 px-3 py-1 text-xs text-white"
        >
          {toast}
        </div>
      )}
    </div>
  );
}