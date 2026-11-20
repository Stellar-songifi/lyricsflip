import React from 'react';

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RULES_DOC_URL = '/docs/game-rules.md';

const HowToPlayModal: React.FC<HowToPlayModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="how-to-play-modal" role="dialog" aria-modal="true" aria-labelledby="how-to-play-title">
      <div className="how-to-play-modal__content">
        <h2 id="how-to-play-title">How to play</h2>

        <ol>
          <li>Join a game mode: solo, head-to-head, or tournament.</li>
          <li>Stake your wager into escrow when the mode requires it.</li>
          <li>Answer each card before its timer (duration) expires.</li>
          <li>Correct answers score points based on the card's difficulty; consecutive correct answers build a streak.</li>
          <li>The higher score wins the pot, minus the protocol fee. Ties and cancelled rounds refund wagers.</li>
        </ol>

        <p>
          For the full rules, scoring, wager escrow, fees, refunds, and glossary, see the{' '}
          <a href={RULES_DOC_URL} target="_blank" rel="noopener noreferrer">
            Game Rules &amp; Glossary
          </a>
          .
        </p>

        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
};

export default HowToPlayModal;
