import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { RoomService } from './room.service';
import { RoomMembershipService } from './room-membership.service';
import { PlayerPresenceService } from './player-presence.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { PlayerIdDto } from './dto/room-membership.dto';
import { UpdatePlayerStatusDto } from './dto/update-player-status.dto';

@ApiTags('rooms')
@Controller('rooms')
export class RoomController {
  constructor(
    private readonly roomService: RoomService,
    private readonly membershipService: RoomMembershipService,
    private readonly presenceService: PlayerPresenceService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new room' })
  @ApiBody({ type: CreateRoomDto })
  @ApiResponse({ status: 201, description: 'Room created successfully' })
  create(@Body() createRoomDto: CreateRoomDto) {
    return this.roomService.create(createRoomDto);
  }

  @Get()
  @ApiOperation({ summary: 'List active rooms' })
  findAll(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
  ) {
    return this.roomService.findAll(limit, page);
  }

  // Player routes are declared before `:id` so they are not shadowed by it.
  @Get('players/:playerId/current')
  @ApiOperation({ summary: "Get a player's current room" })
  async getCurrentRoom(@Param('playerId') playerId: string) {
    const playerRoom = await this.presenceService.getCurrentRoom(playerId);
    if (!playerRoom) return null;
    return {
      roomId: playerRoom.roomId,
      roomName: playerRoom.room.name,
      joinedAt: playerRoom.joinedAt,
    };
  }

  @Get('players/:playerId/history')
  @ApiOperation({ summary: "Get a player's room history" })
  async getPlayerRoomHistory(@Param('playerId') playerId: string) {
    return {
      playerId,
      history: await this.membershipService.getPlayerRoomHistory(playerId),
    };
  }

  @Put('players/:playerId/status')
  @ApiOperation({ summary: "Update a player's online status" })
  updatePlayerStatus(@Param('playerId') playerId: string, @Body() dto: UpdatePlayerStatusDto) {
    return this.presenceService.updateStatus(playerId, dto.status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a room by id' })
  findOne(@Param('id') id: string) {
    return this.roomService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a room' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: UpdateRoomDto })
  update(@Param('id') id: string, @Body() updateRoomDto: UpdateRoomDto) {
    return this.roomService.update(id, updateRoomDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Close a room' })
  @ApiParam({ name: 'id', type: 'string' })
  remove(@Param('id') id: string) {
    return this.roomService.remove(id);
  }

  @Get(':id/player-count')
  @ApiOperation({ summary: 'Get the number of players in a room' })
  async getPlayerCount(@Param('id') id: string) {
    const room = await this.roomService.findOne(id);
    const count = await this.roomService.getCurrentPlayerCount(id);
    return { count, capacity: room.capacity };
  }

  @Get(':id/players')
  @ApiOperation({ summary: 'List players currently in a room' })
  async getRoomPlayers(@Param('id') roomId: string) {
    return {
      roomId,
      players: await this.membershipService.getRoomPlayers(roomId),
    };
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join a room' })
  async join(@Param('id') roomId: string, @Body() { playerId }: PlayerIdDto) {
    const result = await this.membershipService.joinRoom({ playerId, roomId });
    return {
      playerId: result.playerId,
      roomId: result.roomId,
      joinedAt: result.joinedAt,
    };
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a room' })
  async leave(@Param('id') roomId: string, @Body() { playerId }: PlayerIdDto) {
    const result = await this.membershipService.leaveRoom({ playerId, roomId });
    return {
      playerId: result.playerId,
      roomId: result.roomId,
      joinedAt: result.joinedAt,
      leftAt: result.leftAt,
    };
  }
}
