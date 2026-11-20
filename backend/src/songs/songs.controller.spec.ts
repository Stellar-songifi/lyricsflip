import { Test, TestingModule } from '@nestjs/testing';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';
import { GenresService } from './genres.service';
import { Genre } from './enums/genre.enum';

describe('SongsController', () => {
  let controller: SongsController;

  const songsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
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

  it('delegates reads to SongsService', () => {
    controller.findAll({ page: 1 });
    controller.findOne('id');

    expect(songsService.findAll).toHaveBeenCalledWith({ page: 1 });
    expect(songsService.findOne).toHaveBeenCalledWith('id');
  });

  it('records genre plays for the current user', () => {
    controller.recordGenrePlay('user-1', Genre.Jazz, { score: 50 });
    expect(genresService.recordPlay).toHaveBeenCalledWith(
      'user-1',
      Genre.Jazz,
      { score: 50 },
    );
  });
});
