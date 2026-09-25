import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AdminSongsController } from './admin-songs.controller';
import { SongsService } from './songs.service';
import { SongSyncService } from './providers/song-sync.service';

describe('AdminSongsController', () => {
  let controller: AdminSongsController;
  let songsService: jest.Mocked<SongsService>;
  let songSyncService: jest.Mocked<SongSyncService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminSongsController],
      providers: [
        Reflector,
        {
          provide: SongsService,
          useValue: {
            findAllForAdmin: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            approve: jest.fn(),
          },
        },
        {
          provide: SongSyncService,
          useValue: { syncApprovedSongs: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<AdminSongsController>(AdminSongsController);
    songsService = module.get(SongsService);
    songSyncService = module.get(SongSyncService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll lists every song regardless of status', async () => {
    await controller.findAll();
    expect(songsService.findAllForAdmin).toHaveBeenCalled();
  });

  it('approve delegates to the service', async () => {
    await controller.approve('1');
    expect(songsService.approve).toHaveBeenCalledWith('1');
  });

  it('sync delegates to the sync service', async () => {
    (songSyncService.syncApprovedSongs as jest.Mock).mockResolvedValue({
      synced: 0,
      cardIds: [],
    });

    await controller.sync();

    expect(songSyncService.syncApprovedSongs).toHaveBeenCalled();
  });
});
