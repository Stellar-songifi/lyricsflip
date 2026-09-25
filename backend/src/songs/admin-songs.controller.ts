import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { SongsService } from './songs.service';
import { SongSyncService } from './providers/song-sync.service';
import { CreateSongDto } from './dto/create-song.dto';
import { UpdateSongDto } from './dto/update-song.dto';

// Admin-only song catalogue management: curation (create/update/delete/
// approve) and pushing approved songs on-chain. See LF-090.
@ApiTags('admin-songs')
@ApiBearerAuth()
@Controller('admin/songs')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSongsController {
  constructor(
    private readonly songsService: SongsService,
    private readonly songSyncService: SongSyncService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List every song, regardless of curation status' })
  findAll() {
    return this.songsService.findAllForAdmin();
  }

  @Post()
  @ApiOperation({ summary: 'Add a song to the catalogue as a draft' })
  create(@Body() createSongDto: CreateSongDto) {
    return this.songsService.create(createSongDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a song' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSongDto: UpdateSongDto,
  ) {
    return this.songsService.update(id, updateSongDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a song' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.songsService.remove(id);
  }

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve a draft song',
    description:
      'Moves a song to approved, making it eligible for the next /admin/songs/sync run',
  })
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.songsService.approve(id);
  }

  @Post('sync')
  @ApiOperation({
    summary: 'Sync approved songs to the contract',
    description:
      "Submits every 'approved' song via add_card/add_cards, storing the returned card_id and flipping each to 'on_chain'",
  })
  @ApiResponse({
    status: 201,
    description: 'Songs successfully synced to the contract',
  })
  sync() {
    return this.songSyncService.syncApprovedSongs();
  }
}
