import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PlayerRoom } from './entities/player-room.entity';
import { RoomService } from './room.service';
import { PlayerPresenceService } from './player-presence.service';
import { RoomMembershipDto } from './dto/room-membership.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class RoomMembershipService {
  private readonly logger = new Logger(RoomMembershipService.name);

  constructor(
    @InjectRepository(PlayerRoom)
    private playerRoomRepository: Repository<PlayerRoom>,
    private roomService: RoomService,
    private playerPresenceService: PlayerPresenceService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {}

  async joinRoom(dto: RoomMembershipDto): Promise<PlayerRoom> {
    const { playerId, roomId } = dto;

    // Start a transaction to ensure data consistency
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Check if player exists
      const player = await this.playerPresenceService.findById(playerId);

      // Check if room exists and get capacity
      const room = await this.roomService.findOne(roomId);

      // Check room capacity
      const currentPlayerCount = await this.roomService.getCurrentPlayerCount(roomId);
      if (currentPlayerCount >= room.capacity) {
        throw new BadRequestException(`Room ${room.name} is at full capacity`);
      }

      // Check if player is already in a room
      const currentRoom = await this.playerPresenceService.getCurrentRoom(playerId);
      if (currentRoom) {
        // If player is already in this room
        if (currentRoom.roomId === roomId) {
          throw new ConflictException(`Player ${player.username} is already in room ${room.name}`);
        }

        // Leave the current room first
        await this.leaveRoom({
          playerId,
          roomId: currentRoom.roomId,
        });
      }

      // Create new player-room relationship
      const playerRoom = this.playerRoomRepository.create({
        playerId,
        roomId,
        isActive: true,
        joinedAt: new Date(),
      });

      await queryRunner.manager.save(playerRoom);

      // Emit join room event
      this.eventEmitter.emit('player.room.joined', {
        playerId,
        playerName: player.username,
        roomId,
        roomName: room.name,
        timestamp: new Date(),
      });

      this.logger.log(`Player ${player.username} joined room ${room.name}`);

      await queryRunner.commitTransaction();
      return playerRoom;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to join room: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async leaveRoom(dto: RoomMembershipDto): Promise<PlayerRoom> {
    const { playerId, roomId } = dto;

    // Start a transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Check if player exists
      const player = await this.playerPresenceService.findById(playerId);

      // Check if room exists
      const room = await this.roomService.findOne(roomId);

      // Check if player is in the room
      const playerRoom = await this.playerRoomRepository.findOne({
        where: {
          playerId,
          roomId,
          isActive: true,
        },
      });

      if (!playerRoom) {
        throw new BadRequestException(`Player ${player.username} is not in room ${room.name}`);
      }

      // Update player-room relationship
      playerRoom.isActive = false;
      playerRoom.leftAt = new Date();
      await queryRunner.manager.save(playerRoom);

      // Emit leave room event
      this.eventEmitter.emit('player.room.left', {
        playerId,
        playerName: player.username,
        roomId,
        roomName: room.name,
        timestamp: new Date(),
      });

      this.logger.log(`Player ${player.username} left room ${room.name}`);

      await queryRunner.commitTransaction();
      return playerRoom;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to leave room: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getRoomPlayers(roomId: string): Promise<any[]> {
    // Check if room exists
    await this.roomService.findOne(roomId);

    // Get active players in the room
    const playerRooms = await this.roomService.getActivePlayersInRoom(roomId);
    
    return playerRooms.map(pr => ({
      playerId: pr.playerId,
      username: pr.player.username,
      status: pr.player.status,
      joinedAt: pr.joinedAt,
    }));
  }

  async getPlayerRoomHistory(playerId: string): Promise<any[]> {
    // Check if player exists
    await this.playerPresenceService.findById(playerId);

    // Get current room
    const currentRoom = await this.playerPresenceService.getCurrentRoom(playerId);
    
    // Get previous rooms
    const previousRooms = await this.playerPresenceService.getPreviousRooms(playerId);
    
    const history: Array<{
      roomId: string;
      roomName: string;
      joinedAt: Date;
      leftAt: Date | null;
      duration: number | null;
      isCurrent?: boolean;
    }> = previousRooms.map(pr => ({
      roomId: pr.roomId,
      roomName: pr.room.name,
      joinedAt: pr.joinedAt,
      leftAt: pr.leftAt,
      duration: pr.leftAt ? (pr.leftAt.getTime() - pr.joinedAt.getTime()) / 1000 : null,
    }));
    
    if (currentRoom) {
      history.unshift({
        roomId: currentRoom.roomId,
        roomName: currentRoom.room.name,
        joinedAt: currentRoom.joinedAt,
        leftAt: null,
        duration: null,
        isCurrent: true,
      });
    }
    
    return history;
  }
}
