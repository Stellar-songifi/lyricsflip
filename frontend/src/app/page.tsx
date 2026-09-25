'use client';

import Welcome from '@/components/atoms/welcome';
import { GameModal } from '@/components/organisms/game-modal';
import { GameOptions } from '@/components/organisms/game-mode-selection';
import { WagerModal } from '@/components/organisms/WagerModal';
import { useModalStore } from '@/store/modal-store';
import { useStellar, type UseStellarResult } from '@/lib/stellar/hooks/useStellar';

export default function Home() {
  const { openModal } = useModalStore();
  const { systemCalls, account, isLoading, error } = useStellar();

  const handleGameSelect = (gameId: string) => {
    if (gameId === 'quick-game') {
      openModal('game');
    } else if (gameId === 'single-player') {
      openModal('wager');
    }
    // Add handlers for other game types as needed
  };


  // Show loading state while Stellar is initializing
  if (isLoading) {
    return (
      <main className="lg:max-w-[53rem] mt-4 mx-auto h-fit w-full mb-20 lg:mb-12 p-4 lg:p-0 md:mt-24 lg:mt-32">
        <div className="flex items-center justify-center">
          <div className="text-lg">Loading game...</div>
        </div>
      </main>
    );
  }

  // Show error state if initialization failed
  if (error) {
    return (
      <main className="lg:max-w-[53rem] mt-4 mx-auto h-fit w-full mb-20 lg:mb-12 p-4 lg:p-0 md:mt-24 lg:mt-32">
        <div className="flex items-center justify-center">
          <div className="text-lg text-red-500">Error: {error.message}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="lg:max-w-[53rem] mt-4 mx-auto h-fit w-full mb-20 lg:mb-12 p-4 lg:p-0 md:mt-24 lg:mt-32">
      <Welcome />
      <GameOptions onSelectGame={handleGameSelect} />

      {/* Modals */}
      <GameModal />
      <WagerModal />
    </main>
  );
}
