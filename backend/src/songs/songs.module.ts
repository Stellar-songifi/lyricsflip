import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SongsService } from './songs.service';
import { GenresService } from './genres.service';
import { SongsController } from './songs.controller';
import { Song } from './entities/song.entity';
import { Tag } from './entities/tag.entity';
import { UserGenrePreference } from './entities/user-genre-preference.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Song, Tag, UserGenrePreference])],
  controllers: [SongsController],
  providers: [SongsService, GenresService],
  exports: [SongsService, GenresService],
})
export class SongsModule {}
