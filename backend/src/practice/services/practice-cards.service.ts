import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Song, SongStatus } from '../../songs/entities/song.entity';
import { PracticeCardDto, PracticeRoundDto } from '../dto/practice-card.dto';

/** Number of cards dealt per practice round (LF-326). */
const PRACTICE_CARDS = 5;
/** Total distractor options including the correct answer. */
const OPTIONS_COUNT = 4;

/**
 * Returns a fixed-size set of practice cards with shuffled multiple-choice
 * options. No authentication is required — the endpoint is public so that
 * visitors can try the game without installing a wallet.
 *
 * Result ordering is intentionally random on each call to give each
 * visit a fresh experience.
 */
@Injectable()
export class PracticeCardsService {
  constructor(
    @InjectRepository(Song)
    private readonly songRepo: Repository<Song>,
  ) {}

  async getPracticeRound(): Promise<PracticeRoundDto> {
    // Fetch PRACTICE_CARDS random approved/on-chain songs for the round.
    const cards = await this.songRepo
      .createQueryBuilder('song')
      .where('song.status != :draft', { draft: SongStatus.DRAFT })
      .orderBy('RANDOM()')
      .take(PRACTICE_CARDS)
      .getMany();

    // Fetch a broader pool of titles to build distractors from.
    const pool = await this.songRepo
      .createQueryBuilder('song')
      .select(['song.id', 'song.title'])
      .where('song.status != :draft', { draft: SongStatus.DRAFT })
      .getMany();

    const practiceCards: PracticeCardDto[] = cards.map((song) => ({
      id: song.id,
      lyrics: song.lyrics,
      title: song.title,
      artist: song.artist,
      year: song.year,
      genre: song.genre,
      options: this.buildOptions(song.title, pool.map((s) => s.title)),
    }));

    return { cards: practiceCards, total: practiceCards.length };
  }

  /**
   * Builds OPTIONS_COUNT shuffled title options. The correct answer is always
   * included; the remaining slots are filled with random distractors.
   */
  private buildOptions(correctTitle: string, allTitles: string[]): string[] {
    const distractors = allTitles
      .filter((t) => t !== correctTitle)
      .sort(() => Math.random() - 0.5)
      .slice(0, OPTIONS_COUNT - 1);

    // Pad with generic placeholders if the catalogue is too small.
    while (distractors.length < OPTIONS_COUNT - 1) {
      distractors.push(`Option ${distractors.length + 2}`);
    }

    const options = [...distractors, correctTitle];
    // Fisher-Yates shuffle
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return options;
  }
}
