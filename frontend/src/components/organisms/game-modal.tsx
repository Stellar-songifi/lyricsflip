'use client';

import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/atoms/select';
import { useModalStore } from '@/store/modal-store';
import { Info } from 'lucide-react';
import { Modal } from './modal';
import { useTranslations } from 'next-intl';

export function GameModal() {
  const t = useTranslations('gameModal');
  const { isOpen, closeModal, modalType } = useModalStore();
  const [genre, setGenre] = useState<string>('');
  const [difficulty, setDifficulty] = useState<string>('');
  const [duration, setDuration] = useState<string>('');
  const isModalOpen = isOpen && modalType === 'game';

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={closeModal}
      title={t('title')}
      description={t('description')}
      primaryActionLabel={t('startGame')}
    >
      <div className="grid gap-6">
        <div className="grid gap-2">
          <label htmlFor="genre" className="text-sm font-medium">
            {t('genre')}
          </label>
          <Select value={genre} onValueChange={setGenre}>
            <SelectTrigger>
              <SelectValue placeholder={t('selectGenre')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pop">{t('genres.pop')}</SelectItem>
              <SelectItem value="rock">{t('genres.rock')}</SelectItem>
              <SelectItem value="hiphop">{t('genres.hiphop')}</SelectItem>
              <SelectItem value="rnb">{t('genres.rnb')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <label htmlFor="difficulty" className="text-sm font-medium">
            {t('difficulty')}
          </label>
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger>
              <SelectValue placeholder={t('selectDifficulty')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">{t('difficulties.easy')}</SelectItem>
              <SelectItem value="medium">{t('difficulties.medium')}</SelectItem>
              <SelectItem value="hard">{t('difficulties.hard')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <label htmlFor="duration" className="text-sm font-medium">
            {t('duration')}
          </label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger>
              <SelectValue placeholder={t('selectDuration')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5min">{t('durations.5min')}</SelectItem>
              <SelectItem value="10min">{t('durations.10min')}</SelectItem>
              <SelectItem value="15min">{t('durations.15min')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg flex gap-3">
          <div className="bg-purple-100 rounded-full p-1 h-6 w-6 flex items-center justify-center flex-shrink-0">
            <Info className="h-4 w-4 text-purple-600" />
          </div>
          <div className="text-sm">
            <h4 className="font-medium text-purple-700 mb-1">{t('instructionHeading')}</h4>
            <p className="text-gray-700">
              {t('instructionText')}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
