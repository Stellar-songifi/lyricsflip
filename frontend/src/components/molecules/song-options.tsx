'use client';

import { useId, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

interface SongOption {
  title: string;
  artist: string;
}

interface SongOptionsProps {
  options: SongOption[];
  onSelect: (option: SongOption, index: number) => void;
  selectedOption?: SongOption | null;
  correctOption?: SongOption | null;
  /** Accessible name for the answer group (e.g. "Which song?"). */
  groupLabel?: string;
  /** Message announced via aria-live after a selection ("Correct!" / "Wrong! …"). */
  resultAnnouncement?: string | null;
}

/**
 * Answer options for a single card.
 *
 * Accessibility (LF-311):
 * - Rendered as a WAI-ARIA `radiogroup` of `radio` buttons.
 * - Number keys `1`–`4` choose an option directly; arrow keys move focus; the
 *   chosen option is announced through an `aria-live="polite"` region.
 * - A visible focus ring is shown on keyboard focus (`focus-visible:ring-*`).
 */
export function SongOptions({
  options,
  onSelect,
  selectedOption = null,
  correctOption = null,
  groupLabel = 'Answer options',
  resultAnnouncement = null,
}: SongOptionsProps) {
  const baseId = useId();
  const radiosRef = useRef<Array<HTMLButtonElement | null>>([]);
  const disabled = selectedOption !== null;

  const focusRadio = (index: number) => {
    const wrapped = (index + options.length) % options.length;
    radiosRef.current[wrapped]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    if (disabled) return;

    // Number keys 1-4 choose an option directly.
    if (event.key >= '1' && event.key <= '9') {
      const num = Number(event.key) - 1;
      if (num < options.length) {
        event.preventDefault();
        onSelect(options[num], num);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        focusRadio(index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        focusRadio(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusRadio(0);
        break;
      case 'End':
        event.preventDefault();
        focusRadio(options.length - 1);
        break;
    }
  };

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={groupLabel}
        className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8"
      >
        {options.map((option, index) => {
          const isSelected = selectedOption?.title === option.title;
          const isCorrect = correctOption?.title === option.title;

          return (
            <button
              key={`${baseId}-${index}`}
              ref={(el) => {
                radiosRef.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={index === 0 ? 0 : -1}
              onClick={() => onSelect(option, index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              disabled={disabled}
              className={cn(
                'text-left p-4 rounded-lg transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2',
                isCorrect && 'bg-green-100 border-2 border-green-500',
                !isCorrect && isSelected && 'bg-red-100 border-2 border-red-500',
                !isCorrect &&
                  !isSelected &&
                  'bg-purple-50 border border-purple-100 hover:border-purple-300',
              )}
            >
              <h3 className="font-medium text-gray-900">{option.title}</h3>
              <p className="text-sm text-gray-600">{option.artist}</p>
            </button>
          );
        })}
      </div>

      {/* Live region: announces the result of a selection to assistive tech. */}
      <div
        aria-live="polite"
        role="status"
        className="sr-only"
        data-testid="song-options-result"
      >
        {resultAnnouncement}
      </div>
    </div>
  );
}
