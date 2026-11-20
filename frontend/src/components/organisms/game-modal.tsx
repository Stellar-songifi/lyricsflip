'use client';

import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/atoms/select';
import { useModalStore } from '@/store/modal-store';
import { Info } from 'lucide-react';
import { Modal } from './modal';
import { GENRE_OPTIONS } from '@/lib/stellar/genres';

export function GameModal() {
  const { isOpen, closeModal, modalType } = useModalStore();
  const [genre, setGenre] = useState<string>('');
  const [difficulty, setDifficulty] = useState<string>('');
  const [duration, setDuration] = useState<string>('');
  const isModalOpen = isOpen && modalType === 'game';

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={closeModal}
      title="Quick Game"
      description="Jump straight in — no wager, no pressure. Guess lyrics across random genres and see how many you can nail."
      primaryActionLabel="Start Game"
    >
      <div className="grid gap-6">
        <div className="grid gap-2">
          <label htmlFor="genre" className="text-sm font-medium">
            Genre
          </label>
          <Select value={genre} onValueChange={setGenre}>
            <SelectTrigger>
              <SelectValue placeholder="Select genre" />
            </SelectTrigger>
            <SelectContent>
              {GENRE_OPTIONS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <label htmlFor="difficulty" className="text-sm font-medium">
            Difficulty Level
          </label>
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger>
              <SelectValue placeholder="Select difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <label htmlFor="duration" className="text-sm font-medium">
            Duration
          </label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger>
              <SelectValue placeholder="Select duration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5min">5 minutes</SelectItem>
              <SelectItem value="10min">10 minutes</SelectItem>
              <SelectItem value="15min">15 minutes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg flex gap-3">
          <div className="bg-purple-100 rounded-full p-1 h-6 w-6 flex items-center justify-center flex-shrink-0">
            <Info className="h-4 w-4 text-purple-600" />
          </div>
          <div className="text-sm">
            <h4 className="font-medium text-purple-700 mb-1">INSTRUCTION</h4>
            <p className="text-gray-700">
              A card displaying a lyric from a song will appear along with a list of possible answers. Your goal is to
              select the correct answer as quickly as possible.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
