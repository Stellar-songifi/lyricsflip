'use client';

import { useEffect, useRef } from 'react';

export type QuestionKind = 'Title' | 'Artist' | 'Year';

export interface SongOption {
  title: string;
  artist: string;
  /** Optional year value; may be provided as a string or number. */
  year?: string | number;
}

export interface SongOptionsProps {
  options: SongOption[];
  selectedOption?: SongOption | null;
  correctOption?: SongOption | null;
  disabled?: boolean;
  onSelect: (option: SongOption, index: number) => void;
  /** Which question kind is being asked; controls the compared/displayed value. */
  questionKind?: QuestionKind;
}

/**
 * Returns the value that should be compared/displayed for a given option
 * based on the question kind. Year values are always normalized to strings.
 */
function getOptionValue(
  option: SongOption | null | undefined,
  questionKind: QuestionKind,
): string {
  if (!option) return '';
  switch (questionKind) {
    case 'Artist':
      return option.artist ?? '';
    case 'Year':
      return option.year !== undefined && option.year !== null
        ? String(option.year)
        : '';
    case 'Title':
    default:
      return option.title ?? '';
  }
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
  selectedOption = null,
  correctOption = null,
  disabled = false,
  onSelect,
  questionKind = 'Title',
}: SongOptionsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isLocked = disabled || selectedOption !== null;

  // 1–4 hotkeys and arrow-key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when an answer is already selected or being submitted
      if (isLocked) return;

      const key = e.key;

      // Number keys 1–4 select the corresponding option
      if (['1', '2', '3', '4'].includes(key)) {
        const idx = parseInt(key, 10) - 1;
        if (options[idx]) {
          e.preventDefault();
          onSelect(options[idx], idx);
        }
        return;
      }

      // Arrow keys move focus within the grid
      const focusedIndex = buttonRefs.current.findIndex(
        (btn) => btn === document.activeElement,
      );

      if (key === 'ArrowDown' || key === 'ArrowRight') {
        e.preventDefault();
        const next = (focusedIndex + 1) % options.length;
        buttonRefs.current[next]?.focus();
      } else if (key === 'ArrowUp' || key === 'ArrowLeft') {
        e.preventDefault();
        const prev = (focusedIndex - 1 + options.length) % options.length;
        buttonRefs.current[prev]?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, options, onSelect]);

  const selectedValue = getOptionValue(selectedOption, questionKind);
  const correctValue = getOptionValue(correctOption, questionKind);

  // Derive an accessible status message for screen readers
  const getLiveMessage = () => {
    if (!selectedOption) return '';
    const isCorrect = correctValue === selectedValue;
    return isCorrect
      ? `Correct! The answer is ${selectedValue}`
      : `Wrong. The correct answer is ${correctValue}`;
  };

  return (
    <section aria-label="Song answer options">
      {/* aria-live region announces result to screen readers */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {getLiveMessage()}
      </div>

      <p className="sr-only">
        Press 1–4 to select an option, or use arrow keys to navigate and Enter
        to confirm.
      </p>

      <div
        ref={containerRef}
        className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8"
        role="radiogroup"
        aria-label="Answer choices"
        aria-describedby={questionKind ? 'song-options-kind' : undefined}
      >
        {questionKind && (
          <span id="song-options-kind" className="sr-only">
            {questionKind}
          </span>
        )}
        {options.map((option, index) => {
          const optionValue = getOptionValue(option, questionKind);
          const isSelected =
            selectedOption !== null && selectedValue === optionValue;
          const isCorrect =
            correctOption !== null && correctValue === optionValue;
          const isDisabled = isLocked;

          let buttonClasses =
            'text-left p-4 rounded-lg transition-all duration-200 min-h-[44px] w-full ' +
            // Visible focus ring – meets WCAG 2.4.11 (Focus Appearance)
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500 ';

          if (isCorrect) {
            buttonClasses +=
              'bg-green-100 border-2 border-green-500 text-green-900';
          } else if (isSelected) {
            buttonClasses += 'bg-red-100 border-2 border-red-500 text-red-900';
          } else {
            buttonClasses +=
              'bg-purple-50 border border-purple-200 hover:border-purple-400 hover:bg-purple-100 text-gray-900';
          }

          // Build an accessible label that includes the keyboard shortcut
          const ariaLabel = `Option ${index + 1}: ${optionValue}${
            questionKind === 'Title' && option.artist
              ? `, by ${option.artist}`
              : ''
          }${isCorrect ? ' – correct' : isSelected ? ' – incorrect' : ''}`;

          return (
            <button
              key={index}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              onClick={() => onSelect(option, index)}
              className={buttonClasses}
              disabled={isDisabled}
              role="radio"
              aria-checked={isSelected}
              aria-label={ariaLabel}
              aria-disabled={isDisabled}
            >
              {/* Keyboard shortcut hint */}
              <span
                className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold bg-purple-100 text-purple-700 rounded mr-2 select-none"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="font-medium">{optionValue}</span>
              {questionKind === 'Title' && option.artist && (
                <p className="text-sm text-gray-600 mt-1">{option.artist}</p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}