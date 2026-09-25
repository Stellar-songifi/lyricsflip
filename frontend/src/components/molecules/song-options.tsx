'use client';

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
