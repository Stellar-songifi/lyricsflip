"use client";
import { useState } from 'react';

interface Lyric {
  text: string;
  title: string;
  artist: string;
}

export const LyricCard = ({
  lyrics,
  isFlipped, // Controlled by parent
}: {
  lyrics: Lyric[];
  isFlipped: boolean;
}) => {
  const currentLyric = lyrics[0];

  const noiseOverlayStyle = {
    backgroundImage: "url('/Noise.png')",
    backgroundSize: 'cover',
    backgroundBlendMode: 'overlay',
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
    <div className="w-full max-w-[24rem] mx-auto h-[420px] sm:h-[500px] [perspective:1000px]">
      <div className={`relative w-full h-full transition-transform duration-300 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}>
        {/* Front Face */}
        <div className="absolute inset-0 [backface-visibility:hidden]">
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
                        {currentLyric.text}
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
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
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
                      <p className="text-purpleSecondary1 text-center text-md font-medium mb-8 flex-grow flex items-center justify-center whitespace-pre-line">
                        {currentLyric.text}
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
      </div>
    </div>
  );
};