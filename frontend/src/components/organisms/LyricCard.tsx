'use client';

import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { useTranslations } from 'next-intl';

interface Lyric {
  text: string;
  title: string;
  artist: string;
}

const contentStyle = {
  position: 'relative' as const,
  zIndex: 2,
};

function CardFace({
  lyric,
  tone,
  ariaHidden,
  style,
  className,
}: {
  lyric: Lyric;
  tone: 'purple' | 'teal';
  ariaHidden?: boolean;
  style?: React.CSSProperties;
  className?: string;
}) {
  const t = useTranslations('lyricCard');
  const bg = tone === 'purple' ? 'bg-purplePrimary3' : 'bg-tealPrimary1';
  return (
    <div className={`absolute inset-0 ${className ?? ''}`} style={style} aria-hidden={ariaHidden}>
      <div className="bg-[#F5F5F5] rounded-4xl h-full">
        <div className="absolute inset-0 rounded-4xl border border-[#DBE2E7] p-4">
          <div className="bg-white rounded-3xl shadow-md overflow-hidden h-full">
            <div className="rounded-xl overflow-hidden h-full flex flex-col relative">
              <div className={`${bg} p-lg flex-1 flex flex-col relative`}>
                <div style={contentStyle} className="flex-1 flex flex-col">
                  <div className="absolute top-0 right-0 bg-white rounded-full p-2 w-8 h-8 flex items-center justify-center z-10">
                    {/* decorative rotation icon */}
                    <img src="/rot.png" alt="" />
                  </div>
                  <div className="self-center mt-6 mb-4">
                    {/* decorative frame mark */}
                    <img src="/Frame.png" alt="" className="w-20 h-20" />
                  </div>
                  <p className="text-purpleSecondary1 text-center text-md font-medium mb-8 flex-grow flex items-center justify-center whitespace-pre-line">
                    {lyric.text}
                  </p>
                  <p className="text-center text-sm2 pb-2 font-medium text-purplePrimary1">
                    {t('footer')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const LyricCard = ({
  lyrics,
  isFlipped, // Controlled by parent
}: {
  lyrics: Lyric[];
  isFlipped: boolean;
}) => {
  const currentLyric = lyrics[0];
  const reducedMotion = usePrefersReducedMotion();
  const t = useTranslations('lyricCard');

  // With reduced motion, swap the 3D flip for an opacity crossfade and skip
  // the 3D transform entirely (LF-311). Both faces carry the same lyric, so the
  // back face is hidden from assistive tech to avoid reading the text twice.
  if (reducedMotion) {
    return (
      <div className="w-full max-w-[24rem] mx-auto h-[500px] relative">
        <CardFace
          lyric={currentLyric}
          tone="purple"
          style={{
            opacity: isFlipped ? 0 : 1,
            transition: 'opacity 300ms ease',
          }}
        />
        <CardFace
          lyric={currentLyric}
          tone="teal"
          ariaHidden
          style={{
            opacity: isFlipped ? 1 : 0,
            transition: 'opacity 300ms ease',
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-[24rem] mx-auto h-[500px] [perspective:1000px]"
      data-testid="lyric-card"
    >
      <div
        className={`relative w-full h-full transition-transform duration-300 [transform-style:preserve-3d] ${
          isFlipped ? '[transform:rotateY(180deg)]' : ''
        }`}
      >
        <CardFace lyric={currentLyric} tone="purple" className="[backface-visibility:hidden]" />
        <CardFace
          lyric={currentLyric}
          tone="teal"
          ariaHidden
          className="[backface-visibility:hidden] [transform:rotateY(180deg)]"
        />
      </div>
    </div>
  );
};
