import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Song } from './entities/song.entity';
import { Tag } from './entities/tag.entity';
import { CreateSongDto } from './dto/create-song.dto';
import { UpdateSongDto } from './dto/update-song.dto';
import { QuerySongsDto } from './dto/query-songs.dto';
import { Genre } from './enums/genre.enum';

export interface PaginatedSongs {
  data: Song[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class SongsService {
  constructor(
    @InjectRepository(Song)
    private readonly songRepository: Repository<Song>,
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
  ) {}

  async create(dto: CreateSongDto): Promise<Song> {
    const { tags, ...fields } = dto;
    const song = this.songRepository.create({
      ...fields,
      tags: await this.resolveTags(tags),
    });
    return this.songRepository.save(song);
  }

  async findAll(query: QuerySongsDto = {}): Promise<PaginatedSongs> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.songRepository
      .createQueryBuilder('song')
      .leftJoinAndSelect('song.tags', 'tag');

    if (query.genre) {
      qb.andWhere('song.genre = :genre', { genre: query.genre });
    }
    if (query.difficulty) {
      qb.andWhere('song.difficulty = :difficulty', { difficulty: query.difficulty });
    }
    if (query.q) {
      qb.andWhere('(song.title ILIKE :q OR song.artist ILIKE :q)', { q: `%${query.q}%` });
    }
    if (query.tag) {
      // Filter through a subquery so the joined `tags` still lists every tag.
      qb.andWhere(
        'song.id IN (SELECT st."songsId" FROM song_tags st JOIN tags t ON t.id = st."tagsId" WHERE t.name = :tag)',
        { tag: query.tag },
      );
    }

    qb.orderBy(`song.${query.sortBy ?? 'createdAt'}`, query.sortOrder ?? 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Song> {
    const song = await this.songRepository.findOne({ where: { id } });
    if (!song) {
      throw new NotFoundException(`Song with ID ${id} not found`);
    }
    return song;
  }

  async findByOnChainCardId(cardId: string): Promise<Song> {
    const song = await this.songRepository.findOne({ where: { onChainCardId: cardId } });
    if (!song) {
      throw new NotFoundException(`Song for on-chain card ${cardId} not found`);
    }
    return song;
  }

  findByGenre(genre: Genre): Promise<Song[]> {
    return this.songRepository.find({ where: { genre } });
  }

  async update(id: string, dto: UpdateSongDto): Promise<Song> {
    const song = await this.findOne(id);
    const { tags, ...fields } = dto;
    Object.assign(song, fields);
    if (tags) {
      song.tags = await this.resolveTags(tags);
    }
    return this.songRepository.save(song);
  }

  async remove(id: string): Promise<void> {
    const song = await this.findOne(id);
    await this.songRepository.remove(song);
  }

  async incrementPlayCount(id: string): Promise<Song> {
    const song = await this.findOne(id);
    await this.songRepository.increment({ id }, 'playCount', 1);
    song.playCount += 1;
    return song;
  }

  async getRandom(genre?: Genre): Promise<Song> {
    const qb = this.songRepository
      .createQueryBuilder('song')
      .leftJoinAndSelect('song.tags', 'tag')
      .orderBy('RANDOM()')
      .take(1);
    if (genre) {
      qb.where('song.genre = :genre', { genre });
    }
    const song = await qb.getOne();
    if (!song) {
      throw new NotFoundException('No songs available');
    }
    return song;
  }

  /** Finds tags by name, creating any that don't exist yet. */
  private async resolveTags(names?: string[]): Promise<Tag[]> {
    const unique = [...new Set((names ?? []).map((n) => n.trim()).filter(Boolean))];
    if (unique.length === 0) {
      return [];
    }
    const existing = await this.tagRepository.find({ where: { name: In(unique) } });
    const known = new Set(existing.map((t) => t.name));
    const created = unique
      .filter((name) => !known.has(name))
      .map((name) => this.tagRepository.create({ name }));
    const saved = created.length ? await this.tagRepository.save(created) : [];
    return [...existing, ...saved];
  }
}
