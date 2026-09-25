import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GenresService } from './genres.service';
import { Song } from './entities/song.entity';
import { UserGenrePreference } from './entities/user-genre-preference.entity';
import { Genre, genreFromWire, genreToWire } from './enums/genre.enum';

describe('Genre enum', () => {
  it('matches the contract discriminants', () => {
    expect(genreToWire(Genre.HipHop)).toBe(0);
    expect(genreToWire(Genre.Folk)).toBe(12);
    expect(genreFromWire(10)).toBe(Genre.Afrobeat);
    expect(() => genreFromWire(13)).toThrow();
  });
});

describe('GenresService', () => {
  let service: GenresService;

  const preferenceRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => data),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenresService,
        { provide: getRepositoryToken(UserGenrePreference), useValue: preferenceRepository },
        { provide: getRepositoryToken(Song), useValue: {} },
      ],
    }).compile();

    service = module.get(GenresService);
  });

  it('lists all 13 contract genres', () => {
    const genres = service.listGenres();
    expect(genres).toHaveLength(13);
    expect(genres[0]).toEqual({ name: Genre.HipHop, wireValue: 0 });
  });

  it('creates a preference on the first play', async () => {
    preferenceRepository.findOne.mockResolvedValue(null);

    const pref = await service.recordPlay('user-1', Genre.Pop, { score: 80 });

    expect(pref).toMatchObject({ userId: 'user-1', genre: Genre.Pop, playCount: 1 });
    expect(pref.averagePerformance).toBe(80);
  });

  it('updates the running average on later plays', async () => {
    preferenceRepository.findOne.mockResolvedValue({
      userId: 'user-1',
      genre: Genre.Pop,
      playCount: 1,
      averagePerformance: 80,
      preferenceScore: 0,
    });

    const pref = await service.recordPlay('user-1', Genre.Pop, { score: 40, enjoymentRating: 2 });

    expect(pref.playCount).toBe(2);
    expect(pref.averagePerformance).toBe(60);
    expect(pref.preferenceScore).toBeCloseTo(2 * 0.1 + 60 * 0.01 + 2);
  });
});
