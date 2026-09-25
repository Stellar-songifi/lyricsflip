import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SongsService } from './songs.service';
import { GenresService } from './genres.service';
import { SongsController } from './songs.controller';
import { AdminSongsController } from './admin-songs.controller';
import { SongChainSyncService } from './providers/song-chain-sync.service';
import { SongSyncService } from './providers/song-sync.service';
import { Song } from './entities/song.entity';
import { Tag } from './entities/tag.entity';
import { UserGenrePreference } from './entities/user-genre-preference.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Song, Tag, UserGenrePreference])],
  controllers: [SongsController, AdminSongsController],
  providers: [
    SongsService,
    GenresService,
    SongChainSyncService,
    SongSyncService,
  ],
  exports: [SongsService, GenresService],
})
export class SongsModule {}
