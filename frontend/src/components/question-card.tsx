'use client';

import { useTranslations } from 'next-intl';
import { SongOptions, type SongOption } from '@/components/molecules/song-options';
import type { QuestionKind } from '@/lib/stellar/types';

interface QuestionCardProps {
  /** Which attribute the options represent (sent by the contract). */
  kind: QuestionKind;
  options: SongOption[];
  onSelect: (option: SongOption, index: number) => void;
  selectedOption?: SongOption | null;
  correctOption?: SongOption | null;
  /** Message announced via aria-live after a selection. */
  resultAnnouncement?: string | null;
}

/**
 * Question prompt + answer options for a card (LF-308). The prompt is
 * rendered from the question `kind`: "Which song?", "Who sings it?", or
 * "What year?".
 */
export function QuestionCard({
  kind,
  options,
  onSelect,
  selectedOption,
  correctOption,
  resultAnnouncement,
}: QuestionCardProps) {
  const t = useTranslations('questionCard');
  return (
    <div>
      <p className="text-xl font-bold mb-4 text-gray-900" data-testid="question-prompt">
        {t(kind)}
      </p>
      <SongOptions
        options={options}
        onSelect={onSelect}
        selectedOption={selectedOption}
        correctOption={correctOption}
        resultAnnouncement={resultAnnouncement}
      />
    </div>
  );
}
