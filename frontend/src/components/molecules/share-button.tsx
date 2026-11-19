'use client';

import { Share } from 'lucide-react';
import { CounterBadge } from '../atoms/counter-badge';
import { Button } from '../atoms/button';
import { useTranslations } from 'next-intl';

interface ShareButtonProps {
  shareCount: number
  hugCount: number
  onShare?: () => void
}

export function ShareButton({ shareCount, hugCount, onShare }: ShareButtonProps) {
  const t = useTranslations('shareButton');
  return (
    <Button
      variant="outlinePurple"
      className="flex items-center justify-between gap-2 w-full border-dashed"
      onClick={onShare}
    >
      <div className="flex items-center gap-2">
        <Share className="h-4 w-4" />
        <span>{t('label')}</span>
      </div>
      <div className="flex items-center gap-2">
        <CounterBadge count={shareCount} label="" />
        <CounterBadge count={hugCount} label={t('hug')} />
      </div>
    </Button>
  );
}

