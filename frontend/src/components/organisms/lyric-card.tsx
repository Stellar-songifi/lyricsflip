"use client";

import { useEffect, useRef } from 'react';

interface Lyric {
  text: string;
  title: string;
  artist: string;
}

interface LyricCardProps {
  lyrics: Lyric[];
  isFlipped: boolean; // Controlled by parent
}

export const LyricCard = ({ lyrics, isFlipped }: LyricCardProps) => {
  const currentLyric = lyrics[0];
  const announceRef = useRef<HTMLDivElement>(null);

  // Announce the revealed answer to screen readers when the card flips
  useEffect(() => {
    if (isFlipped && currentLyric && announceRef.current) {
      announceRef.current.textContent = `Card flipped. The answer is ${currentLyric.title} by ${currentLyric.artist}.`;
    }
  }, [isFlipped, currentLyric]);

  const noiseOverlayStyle = {
    backgroundImage: "url('/Noise.png')",
    backgroundSize: 'cover',
    backgroundBlendMode: 'overlay' as const,
    opacity: 0.4,
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  };

  const contentStyle = {
    position: 'relative' as const,
    zIndex: 2,
  };

  return (
    <>
      {/*
       * aria-live region to announce the revealed answer.
       * Uses "assertive" so it interrupts current narration — the flip is the
       * primary feedback moment for the user.
       */}
      <div
        ref={announceRef}
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />

      {/*
       * The flip wrapper respects prefers-reduced-motion:
       *   - Full motion: CSS 3-D flip over 300 ms.
       *   - Reduced motion: instant visibility swap, no rotation.
       *
       * aria-label updates dynamically so the card has a meaningful accessible
       * name before and after the flip.
       */}
      <div
        className="w-full max-w-[24rem] mx-auto h-[500px] [perspective:1000px]"
        role="region"
        aria-label={
          isFlipped
            ? `Answer revealed: ${currentLyric?.title ?? ''} by ${currentLyric?.artist ?? ''}`
            : 'Lyric card – guess the song'
        }
      >
        <div
          className={[
            'relative w-full h-full',
            // Full-motion flip
            'motion-safe:transition-transform motion-safe:duration-300 motion-safe:[transform-style:preserve-3d]',
            isFlipped ? 'motion-safe:[transform:rotateY(180deg)]' : '',
          ].join(' ')}
          aria-hidden="true" // The live region above handles screen-reader feedback
        >
          {/* Front Face */}
          <div
            className={[
              'absolute inset-0 [backface-visibility:hidden]',
              // Reduced-motion: show/hide without rotating
              'motion-reduce:transition-none',
              isFlipped ? 'motion-reduce:invisible motion-reduce:opacity-0' : 'motion-reduce:visible motion-reduce:opacity-100',
            ].join(' ')}
          >
            <div className="bg-[#F5F5F5] rounded-4xl h-full">
              <div className="absolute inset-0 rounded-4xl border border-[#DBE2E7] p-4">
                <div className="bg-white rounded-3xl shadow-md overflow-hidden h-full">
                  <div className="rounded-xl overflow-hidden h-full flex flex-col relative">
                    <div className="bg-purplePrimary3 p-lg flex-1 flex flex-col relative">
                      <div style={contentStyle} className="flex-1 flex flex-col">
                        <div className="absolute top-0 right-0 bg-white rounded-full p-2 w-8 h-8 flex items-center justify-center z-10">
                          <img src="/rot.png" alt="" />
                        </div>
                        <div className="self-center mt-6 mb-4">
                          <img src="/Frame.png" alt="" className="w-20 h-20" />
                        </div>
                        <p className="text-purpleSecondary1 text-center text-md font-medium mb-8 flex-grow flex items-center justify-center whitespace-pre-line">
                          {currentLyric?.text}
                        </p>
                        <p className="text-center text-sm2 pb-2 font-medium text-purplePrimary1">
                          LyricFlip...join the fun🎶🩵
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Back Face */}
          <div
            className={[
              'absolute inset-0 [backface-visibility:hidden] motion-safe:[transform:rotateY(180deg)]',
              // Reduced-motion: show/hide without rotating
              'motion-reduce:transition-none',
              isFlipped ? 'motion-reduce:visible motion-reduce:opacity-100' : 'motion-reduce:invisible motion-reduce:opacity-0',
            ].join(' ')}
          >
            <div className="bg-[#F5F5F5] rounded-4xl h-full">
              <div className="absolute inset-0 rounded-4xl border border-[#DBE2E7] p-4">
                <div className="bg-white rounded-3xl shadow-md overflow-hidden h-full">
                  <div className="rounded-xl overflow-hidden h-full flex flex-col relative">
                    <div className="bg-tealPrimary1 p-lg flex-1 flex flex-col relative">
                      <div style={contentStyle} className="flex-1 flex flex-col">
                        <div className="absolute top-0 right-0 bg-white rounded-full p-2 w-8 h-8 flex items-center justify-center z-10">
                          <img src="/rot.png" alt="" />
                        </div>
                        <div className="self-center mt-6 mb-4">
                          <img src="/Frame.png" alt="" className="w-20 h-20" />
                        </div>
                        {/* Show the revealed answer on the back face */}
                        <div className="flex-grow flex flex-col items-center justify-center">
                          <p className="text-purpleSecondary1 text-center text-lg font-bold mb-2 whitespace-pre-line">
                            {currentLyric?.title}
                          </p>
                          <p className="text-purpleSecondary1 text-center text-sm font-medium whitespace-pre-line">
                            {currentLyric?.artist}
                          </p>
                        </div>
                        <p className="text-center text-sm2 pb-2 font-medium text-purplePrimary1">
                          LyricFlip...join the fun🎶🩵
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
