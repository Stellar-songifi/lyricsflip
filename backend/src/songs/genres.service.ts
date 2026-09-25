import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Song } from './entities/song.entity';
import { UserGenrePreference } from './entities/user-genre-preference.entity';
import { Genre, GENRE_VALUES, genreToWire } from './enums/genre.enum';
import { RecordGenrePlayDto } from './dto/record-genre-play.dto';

@Injectable()
export class GenresService {
  constructor(
    @InjectRepository(UserGenrePreference)
    private readonly preferenceRepository: Repository<UserGenrePreference>,
    @InjectRepository(Song)
    private readonly songRepository: Repository<Song>,
  ) {}

  /** The contract's genres with their on-chain discriminants. */
  listGenres(): Array<{ name: Genre; wireValue: number }> {
    return GENRE_VALUES.map((name) => ({ name, wireValue: genreToWire(name) }));
  }

  async recordPlay(
    userId: string,
    genre: Genre,
    dto: RecordGenrePlayDto,
  ): Promise<UserGenrePreference> {
    const preference =
      (await this.preferenceRepository.findOne({ where: { userId, genre } })) ??
      this.preferenceRepository.create({
        userId,
        genre,
        preferenceScore: 0,
        playCount: 0,
        averagePerformance: 0,
      });

    preference.playCount += 1;
    preference.averagePerformance =
      (preference.averagePerformance * (preference.playCount - 1) + dto.score) /
      preference.playCount;
    preference.preferenceScore =
      preference.playCount * 0.1 +
      preference.averagePerformance * 0.01 +
      (dto.enjoymentRating ?? 0);

    return this.preferenceRepository.save(preference);
  }

  getPreferences(userId: string): Promise<UserGenrePreference[]> {
    return this.preferenceRepository.find({
      where: { userId },
      order: { preferenceScore: 'DESC' },
    });
  }

  /** Least-played songs, ordered by the user's genre preference. */
  async recommendSongs(userId: string, limit = 10): Promise<Song[]> {
    const preferred = (await this.getPreferences(userId)).map((p) => p.genre);

    const qb = this.songRepository
      .createQueryBuilder('song')
      .leftJoinAndSelect('song.tags', 'tag');

    if (preferred.length > 0) {
      qb.addSelect('array_position(CAST(:preferred AS text[]), CAST(song.genre AS text))', 'rank')
        .setParameter('preferred', preferred)
        .orderBy('rank', 'ASC', 'NULLS LAST');
    }

    return qb.addOrderBy('song.playCount', 'ASC').take(limit).getMany();
  }
}
