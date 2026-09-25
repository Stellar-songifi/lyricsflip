import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseEnumPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SongsService } from './songs.service';
import { GenresService } from './genres.service';
import { CreateSongDto } from './dto/create-song.dto';
import { UpdateSongDto } from './dto/update-song.dto';
import { QuerySongsDto } from './dto/query-songs.dto';
import { RecordGenrePlayDto } from './dto/record-genre-play.dto';
import { Genre } from './enums/genre.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('songs')
@Controller('songs')
export class SongsController {
  constructor(
    private readonly songsService: SongsService,
    private readonly genresService: GenresService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a song' })
  create(@Body() dto: CreateSongDto) {
    return this.songsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List songs with filtering, search, sorting and pagination' })
  findAll(@Query() query: QuerySongsDto) {
    return this.songsService.findAll(query);
  }

  @Get('random')
  @ApiOperation({ summary: 'Get a random song, optionally within a genre' })
  @ApiQuery({ name: 'genre', enum: Genre, required: false })
  getRandom(@Query('genre', new ParseEnumPipe(Genre, { optional: true })) genre?: Genre) {
    return this.songsService.getRandom(genre);
  }

  @Get('genres')
  @ApiOperation({ summary: 'List the genres supported by the contract' })
  listGenres() {
    return this.genresService.listGenres();
  }

  @Get('genres/preferences')
  @ApiOperation({ summary: "Get the current user's genre preferences" })
  getPreferences(@CurrentUser('sub') userId: string) {
    return this.genresService.getPreferences(userId);
  }

  @Post('genres/:genre/plays')
  @ApiOperation({ summary: 'Record a round played in a genre for the current user' })
  recordGenrePlay(
    @CurrentUser('sub') userId: string,
    @Param('genre', new ParseEnumPipe(Genre)) genre: Genre,
    @Body() dto: RecordGenrePlayDto,
  ) {
    return this.genresService.recordPlay(userId, genre, dto);
  }

  @Get('recommended')
  @ApiOperation({ summary: "Songs ordered by the current user's genre preferences" })
  recommend(@CurrentUser('sub') userId: string) {
    return this.genresService.recommendSongs(userId);
  }

  @Get('genre/:genre')
  @ApiOperation({ summary: 'Get songs by genre' })
  findByGenre(@Param('genre', new ParseEnumPipe(Genre)) genre: Genre) {
    return this.songsService.findByGenre(genre);
  }

  @Get('card/:cardId')
  @ApiOperation({ summary: 'Get the song for an on-chain card id' })
  findByCard(@Param('cardId') cardId: string) {
    return this.songsService.findByOnChainCardId(cardId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a song by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.songsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a song' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSongDto) {
    return this.songsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a song' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.songsService.remove(id);
  }

  @Post(':id/play')
  @ApiOperation({ summary: 'Increment play count' })
  incrementPlayCount(@Param('id', ParseUUIDPipe) id: string) {
    return this.songsService.incrementPlayCount(id);
  }
}
