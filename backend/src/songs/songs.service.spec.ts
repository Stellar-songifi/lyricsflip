import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { SongsService } from './songs.service';
import { Song } from './entities/song.entity';
import { Tag } from './entities/tag.entity';
import { Genre } from './enums/genre.enum';
import { CreateSongDto } from './dto/create-song.dto';

const queryBuilder = () => {
  const qb: Record<string, jest.Mock> = {};
  for (const method of ['leftJoinAndSelect', 'andWhere', 'where', 'orderBy', 'skip', 'take']) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  qb.getOne = jest.fn().mockResolvedValue(null);
  return qb;
};

describe('SongsService', () => {
  let service: SongsService;
  let qb: ReturnType<typeof queryBuilder>;

  const songRepository = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ id: 'song-1', ...data })),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
    increment: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const tagRepository = {
    find: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (tags) => tags.map((t, i) => ({ id: `new-${i}`, ...t }))),
  };

  const dto: CreateSongDto = {
    genre: Genre.Afrobeat,
    artist: 'Demo Artist',
    title: 'Demo Song',
    year: 2020,
    lyrics: 'short original lyric',
    source: 'Original demo lyrics written for LyricsFlip (CC0)',
    license: 'CC0-1.0',
    tags: ['dance', 'party', 'dance'],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    qb = queryBuilder();
    songRepository.createQueryBuilder.mockReturnValue(qb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SongsService,
        { provide: getRepositoryToken(Song), useValue: songRepository },
        { provide: getRepositoryToken(Tag), useValue: tagRepository },
      ],
    }).compile();

    service = module.get(SongsService);
  });

  describe('create', () => {
    it('reuses existing tags and creates missing ones', async () => {
      tagRepository.find.mockResolvedValue([{ id: 'tag-1', name: 'dance' }]);

      const song = await service.create(dto);

      expect(tagRepository.create).toHaveBeenCalledTimes(1);
      expect(tagRepository.create).toHaveBeenCalledWith({ name: 'party' });
      expect(song.tags).toEqual([
        { id: 'tag-1', name: 'dance' },
        { id: 'new-0', name: 'party' },
      ]);
      expect(song).toMatchObject({ genre: Genre.Afrobeat, license: 'CC0-1.0' });
    });

    it('skips tag lookups when no tags are given', async () => {
      await service.create({ ...dto, tags: undefined });
      expect(tagRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('applies filters and pagination', async () => {
      qb.getManyAndCount.mockResolvedValue([[{ id: 'song-1' }], 21]);

      const result = await service.findAll({
        genre: Genre.Rock,
        q: 'love',
        sortBy: 'year',
        sortOrder: 'ASC',
        page: 2,
        limit: 10,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('song.genre = :genre', { genre: Genre.Rock });
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(song.title ILIKE :q OR song.artist ILIKE :q)',
        { q: '%love%' },
      );
      expect(qb.orderBy).toHaveBeenCalledWith('song.year', 'ASC');
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result).toEqual({ data: [{ id: 'song-1' }], total: 21, page: 2, limit: 10 });
    });
  });

  describe('findOne', () => {
    it('throws when the song does not exist', async () => {
      songRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('merges fields and replaces tags only when given', async () => {
      songRepository.findOne.mockResolvedValue({ id: 'song-1', title: 'Old', tags: [] });

      const updated = await service.update('song-1', { title: 'New' });

      expect(tagRepository.find).not.toHaveBeenCalled();
      expect(updated).toMatchObject({ id: 'song-1', title: 'New', tags: [] });
    });
  });

  describe('remove', () => {
    it('removes an existing song', async () => {
      const song = { id: 'song-1' };
      songRepository.findOne.mockResolvedValue(song);
      await service.remove('song-1');
      expect(songRepository.remove).toHaveBeenCalledWith(song);
    });
  });

  describe('incrementPlayCount', () => {
    it('increments the stored count', async () => {
      songRepository.findOne.mockResolvedValue({ id: 'song-1', playCount: 4 });
      const song = await service.incrementPlayCount('song-1');
      expect(songRepository.increment).toHaveBeenCalledWith({ id: 'song-1' }, 'playCount', 1);
      expect(song.playCount).toBe(5);
    });
  });

  describe('getRandom', () => {
    it('throws when there are no songs', async () => {
      await expect(service.getRandom(Genre.Jazz)).rejects.toThrow(NotFoundException);
      expect(qb.where).toHaveBeenCalledWith('song.genre = :genre', { genre: Genre.Jazz });
    });
  });
});
