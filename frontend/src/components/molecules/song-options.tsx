'use client';

import { useEffect, useRef } from 'react';

interface SongOption {
  title: string;
  artist: string;
}

interface SongOptionsProps {
  options: SongOption[];
  onSelect: (option: SongOption, index: number) => void;
  selectedOption?: SongOption | null;
  correctOption?: SongOption | null;
}

export function SongOptions({
  options,
  onSelect,
  selectedOption = null,
  correctOption = null,
}: SongOptionsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 1–4 hotkeys and arrow-key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when an answer is already selected
      if (selectedOption !== null) return;

      const key = e.key;

      // Number keys 1–4 select the corresponding option
      if (['1', '2', '3', '4'].includes(key)) {
        const idx = parseInt(key, 10) - 1;
        if (options[idx]) {
          e.preventDefault();
          onSelect(options[idx], idx);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
      {options.map((option, index) => {
        const isSelected = selectedOption?.title === option.title;
        const isCorrect = correctOption?.title === option.title;

        let buttonClasses =
          'text-left p-4 rounded-lg transition-all duration-200 ';

        if (isCorrect) {
          buttonClasses += 'bg-green-100 dark:bg-green-900 border-2 border-green-500';
        } else if (isSelected) {
          buttonClasses += 'bg-red-100 dark:bg-red-900 border-2 border-red-500';
        } else {
          buttonClasses += 'bg-purple-50 dark:bg-gray-700 border border-purple-100 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-500';
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
  }, [options, onSelect, selectedOption]);

  // Derive an accessible status message for screen readers
  const getLiveMessage = () => {
    if (!selectedOption) return '';
    const isCorrect = correctOption?.title === selectedOption.title;
    return isCorrect
      ? `Correct! The answer is ${selectedOption.title}`
      : `Wrong. The correct answer is ${correctOption?.title ?? ''}`;
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
        role="group"
        aria-label="Answer choices"
      >
        {options.map((option, index) => {
          const isSelected = selectedOption?.title === option.title;
          const isCorrect = correctOption?.title === option.title;
          const isDisabled = selectedOption !== null;

          let buttonClasses =
            'text-left p-4 rounded-lg transition-all duration-200 ' +
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
          const ariaLabel = `Option ${index + 1}: ${option.title}${
            option.artist ? `, by ${option.artist}` : ''
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
              aria-pressed={isSelected}
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
              <span className="font-medium">{option.title}</span>
              {option.artist && (
                <p className="text-sm text-gray-600 mt-1">{option.artist}</p>
              )}
            </button>
          );
        })}
      </div>
    </section>
        return (
          <button
            key={index}
            onClick={() => onSelect(option, index)}
            className={buttonClasses}
            disabled={selectedOption !== null}
          >
            <h3 className="font-medium text-gray-900 dark:text-gray-100">{option.title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{option.artist}</p>
          </button>
        );
      })}
    </div>
  );
}
