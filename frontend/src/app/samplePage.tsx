'use client';

import { ShareButton } from '@/components/molecules/share-button';
import { GameCard } from '@/components/molecules/game-card';
import { SongCard } from '@/components/molecules/song-card';
import { GameModal } from '@/components/organisms/game-modal';
import { useModalStore } from '@/store/modal-store';
import { useState } from 'react';
import { Modal } from '@/components/organisms/modal';
import { Button } from '@/components/atoms/button';
import BadgeModal from '@/components/organisms/newbadgemodal';


export default function SamplePage() {
  const { openModal } = useModalStore();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showBadgeModal, setShowBadgeModal] = useState(true);

  // Example of using the reusable modal with different content
  const handleOpenSettingsModal = () => {
    setShowSettingsModal(true);
  };

  return (
    <main className="container mx-auto p-4 max-w-5xl mt-20">
      {showBadgeModal && (
        <BadgeModal onClose={() => setShowBadgeModal(false)} />
      )}
      <h1 className="text-2xl font-bold mb-8 text-center">
        Welcome to LyricFlip,{' '}
        <span className="text-purple-600">thetimijeyin</span>
      </h1>
      {/* Game Actions */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <ShareButton
          shareCount={238}
          hugCount={72}
          onShare={() => console.log('Share clicked')}
        />
        <Button
          variant="purple"
          size="full"
          onClick={() => console.log('Play Again clicked')}
        >
          Play Again
        </Button>
      </div>

      {/* Game Modes */}
      <h2 className="text-lg font-semibold uppercase mb-4 text-gray-600">
        Choose your preferred game mode
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <GameCard
          type="quick"
          title="Quick Game"
          description="Jump straight in — guess the missing lyrics against the clock, no stakes attached."
          onClick={() => openModal('game')}
        />
        <GameCard
          type="wager-single"
          title="Wager (Single Player)"
          description="Stake STRK on your own lyric knowledge — guess right and take the pot."
          onClick={handleOpenSettingsModal}
        />
        <GameCard
          type="wager-multi"
          title="Wager (Multi Player)"
          description="Battle other players head-to-head — highest score takes the pooled STRK pot."
        />
        <GameCard
          type="challenge"
          title="Join a Challenge"
          description="Accept an open challenge from another player and battle for the wager."
        />
      </div>

      {/* Song Cards */}
      <h2 className="text-lg font-semibold uppercase mb-4 text-gray-600">
        Recent Songs
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SongCard title="Pakurumo" artist="Wizkid & Samklef" />
        <SongCard
          title="Don't Let Me Down"
          artist="Chainsmokers"
          score={413}
          maxScore={88}
        />
        <SongCard
          title="Blood on The Dance Floor"
          artist="ODUMODU BLVCK, Bloody Civilian & Waje"
          score={413}
          maxScore={88}
        />
        <SongCard title="God's Plan" artist="Drake" score={413} maxScore={88} />
      </div>

      {/* Modals */}
      <GameModal />

      {/* Example of using the reusable modal with different content */}
      <Modal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        title="Settings"
        description="Customize your game experience"
        primaryActionLabel="Save Settings"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Game Preferences</h3>
            <p className="text-sm text-gray-500">
              Customize your game settings and preferences here. These settings
              will apply to all game modes.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Notification Settings</h3>
            <p className="text-sm text-gray-500">
              Control which notifications you receive and how they are
              delivered.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Account Settings</h3>
            <p className="text-sm text-gray-500">
              Manage your account details, privacy settings, and linked
              accounts.
            </p>
          </div>
        </div>
      </Modal>
    </main>
  );
}
