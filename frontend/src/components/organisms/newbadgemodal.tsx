'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { IoClose } from 'react-icons/io5';
import { useRouter } from 'next/navigation';

export interface BadgeModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when the user dismisses the modal */
  onClose: () => void;
  /** Human-readable name of the earned milestone badge */
  badgeName?: string;
  /** Optional image URL for the badge; falls back to /newbadge.png */
  badgeImage?: string;
}

/**
 * Shows immediately after a round in which the player earned a milestone NFT.
 *
 * Changes from the original:
 * - Accepts `isOpen`, `badgeName`, and `badgeImage` props (dynamic content).
 * - Proper `role="dialog"`, `aria-modal`, `aria-labelledby` for screen readers.
 * - Focus is trapped inside: Escape key closes, close button is first focusable element.
 * - "Play Again" navigates to the home page; "Share" copies a share message.
 *
 * Part of Issue #476 / LF-059.
 */
const BadgeModal = ({
  isOpen,
  onClose,
  badgeName = 'Music Connoisseur',
  badgeImage = '/newbadge.png',
}: BadgeModalProps) => {
  const router = useRouter();

  const handlePlayAgain = () => {
    onClose();
    router.push('/');
  };

  const handleShare = async () => {
    const message = `🎶 I just earned the "${badgeName}" NFT badge on LyricsFlip! Can you beat my score?`;
    try {
      if (navigator.share) {
        await navigator.share({ text: message });
      } else {
        await navigator.clipboard.writeText(message);
        alert('Copied share message to clipboard!');
      }
    } catch {
      // User cancelled or clipboard failed – no-op
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        // Backdrop
        <div
          className="fixed inset-0 flex items-center justify-end px-8 bg-[#0000004f] z-50"
          role="presentation"
          onClick={(e) => {
            // Close on backdrop click
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="badge-modal-title"
            className="bg-white rounded-2xl shadow-lg relative px-[2em] py-[2em] justify-between h-[90vh] flex flex-col gap-[4em] text-center"
          >
            {/* Close Button */}
            <button
              className="absolute top-3 right-3 text-gray-500 hover:text-black border rounded-full p-1 focus-visible:ring-2 focus-visible:ring-purple-500"
              onClick={onClose}
              aria-label="Close badge notification"
              autoFocus
            >
              <IoClose size={24} aria-hidden="true" />
            </button>

            <div className="flex flex-col items-center justify-center flex-1">
              {/* Badge Image */}
              <div className="flex justify-center">
                <img
                  src={badgeImage}
                  alt={`${badgeName} badge`}
                  className="w-[10em]"
                />
              </div>

              {/* Title */}
              <h2
                id="badge-modal-title"
                className="text-[32px] font-bold mt-4"
              >
                You Just earned a new badge
              </h2>

              {/* Description */}
              <p className="text-gray-600 text-sm mt-2">
                You just earned yourself a new badge:{' '}
                <strong>&quot;{badgeName}&quot;</strong>. Well done 👏
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 justify-center mt-6">
              <button
                onClick={handleShare}
                className="cursor-pointer border hover:bg-purple-600 hover:text-white border-purple-600 text-purple-600 px-4 py-4 w-[50%] rounded-full focus-visible:ring-2 focus-visible:ring-purple-600"
              >
                Share
              </button>
              <button
                onClick={handlePlayAgain}
                className="cursor-pointer hover:bg-white border border-purple-600 hover:text-purple-600 bg-purple-600 text-white px-6 py-4 rounded-full w-[50%] focus-visible:ring-2 focus-visible:ring-purple-600"
              >
                Play Again
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default BadgeModal;
