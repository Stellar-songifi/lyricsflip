import { Test, TestingModule } from '@nestjs/testing';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';
import { GenresService } from './genres.service';
import { Genre } from './enums/genre.enum';

describe('SongsController', () => {
  let controller: SongsController;

  const songsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getRandom: jest.fn(),
    findByGenre: jest.fn(),
    findByOnChainCardId: jest.fn(),
    incrementPlayCount: jest.fn(),
  };
  const genresService = {
    listGenres: jest.fn(),
    getPreferences: jest.fn(),
    recordPlay: jest.fn(),
    recommendSongs: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SongsController],
      providers: [
        { provide: SongsService, useValue: songsService },
        { provide: GenresService, useValue: genresService },
      ],
    }).compile();

    controller = module.get(SongsController);
  });

  it('delegates CRUD to SongsService', () => {
    const dto = {
      genre: Genre.Rock,
      artist: 'a',
      title: 't',
      year: 2000,
      lyrics: 'l',
      source: 's',
      license: 'CC0-1.0',
    };
    controller.create(dto);
    controller.findAll({ page: 1 });
    controller.findOne('id');
    controller.update('id', { title: 'x' });
    controller.remove('id');

    expect(songsService.create).toHaveBeenCalledWith(dto);
    expect(songsService.findAll).toHaveBeenCalledWith({ page: 1 });
    expect(songsService.findOne).toHaveBeenCalledWith('id');
    expect(songsService.update).toHaveBeenCalledWith('id', { title: 'x' });
    expect(songsService.remove).toHaveBeenCalledWith('id');
  });

  it('records genre plays for the current user', () => {
    controller.recordGenrePlay('user-1', Genre.Jazz, { score: 50 });
    expect(genresService.recordPlay).toHaveBeenCalledWith('user-1', Genre.Jazz, { score: 50 });
  });
});
