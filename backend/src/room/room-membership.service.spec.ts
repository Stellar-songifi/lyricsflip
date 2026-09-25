import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RoomMembershipService } from './room-membership.service';
import { RoomService } from './room.service';
import { PlayerPresenceService } from './player-presence.service';
import { PlayerRoom } from './entities/player-room.entity';
import { Room } from './entities/room.entity';
import { Player } from '../player/player.entity';
import { PlayerStatus } from '../player/enums/player-status.enum';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('RoomMembershipService', () => {
  let service: RoomMembershipService;
  let roomService: RoomService;
  let playerService: PlayerPresenceService;
  let playerRoomRepository: Repository<PlayerRoom>;
  let eventEmitter: EventEmitter2;

  // Mock test data
  const testRoom = {
    id: '1',
    name: 'Test Room',
    description: 'A test room',
    capacity: 5,
    isActive: true,
  };

  const testPlayer = {
    id: '1',
    username: 'testuser',
    status: PlayerStatus.ONLINE,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomMembershipService,
        {
          provide: RoomService,
          useValue: {
            findOne: jest.fn(),
            getCurrentPlayerCount: jest.fn(),
            getActivePlayersInRoom: jest.fn(),
          },
        },
        {
          provide: PlayerPresenceService,
          useValue: {
            findById: jest.fn(),
            getCurrentRoom: jest.fn(),
            getPreviousRooms: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PlayerRoom),
          useValue: {
            create: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
              manager: {
                save: jest.fn(),
              },
            }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RoomMembershipService>(RoomMembershipService);
    roomService = module.get<RoomService>(RoomService);
    playerService = module.get<PlayerPresenceService>(PlayerPresenceService);
    playerRoomRepository = module.get<Repository<PlayerRoom>>(getRepositoryToken(PlayerRoom));
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('joinRoom', () => {
    it('should allow a player to join a room', async () => {
      // Arrange
      const joinRoomDto = { playerId: '1', roomId: '1' };
      const newPlayerRoom = { playerId: '1', roomId: '1', isActive: true, joinedAt: new Date() };
      
      jest.spyOn(roomService, 'findOne').mockResolvedValue(testRoom as Room);
      jest.spyOn(playerService, 'findById').mockResolvedValue(testPlayer as Player);
      jest.spyOn(roomService, 'getCurrentPlayerCount').mockResolvedValue(2);
      jest.spyOn(playerService, 'getCurrentRoom').mockResolvedValue(null);
      jest.spyOn(playerRoomRepository, 'create').mockReturnValue(newPlayerRoom as PlayerRoom);
      const saveSpy = jest.spyOn(service['dataSource'].createQueryRunner().manager, 'save')
        .mockResolvedValue(newPlayerRoom as PlayerRoom);
      
      // Act
      const result = await service.joinRoom(joinRoomDto);
      
      // Assert
      expect(roomService.findOne).toHaveBeenCalledWith('1');
      expect(playerService.findById).toHaveBeenCalledWith('1');
      expect(roomService.getCurrentPlayerCount).toHaveBeenCalledWith('1');
      expect(playerService.getCurrentRoom).toHaveBeenCalledWith('1');
      expect(playerRoomRepository.create).toHaveBeenCalledWith({
        playerId: '1',
        roomId: '1',
        isActive: true,
        joinedAt: expect.any(Date),
      });
      expect(saveSpy).toHaveBeenCalledWith(newPlayerRoom);
      expect(eventEmitter.emit).toHaveBeenCalledWith('player.room.joined', expect.any(Object));
      expect(result).toEqual(newPlayerRoom);
    });

    it('should throw BadRequestException when room is at capacity', async () => {
      // Arrange
      const joinRoomDto = { playerId: '1', roomId: '1' };
      
      jest.spyOn(roomService, 'findOne').mockResolvedValue(testRoom as Room);
      jest.spyOn(playerService, 'findById').mockResolvedValue(testPlayer as Player);
      jest.spyOn(roomService, 'getCurrentPlayerCount').mockResolvedValue(5); // Room at capacity
      
      // Act & Assert
      await expect(service.joinRoom(joinRoomDto)).rejects.toThrow(BadRequestException);
      expect(roomService.getCurrentPlayerCount).toHaveBeenCalledWith('1');
    });

    it('should throw ConflictException when player is already in the room', async () => {
      // Arrange
      const joinRoomDto = { playerId: '1', roomId: '1' };
      const currentRoom = { playerId: '1', roomId: '1', room: testRoom };
      
      jest.spyOn(roomService, 'findOne').mockResolvedValue(testRoom as Room);
      jest.spyOn(playerService, 'findById').mockResolvedValue(testPlayer as Player);
      jest.spyOn(roomService, 'getCurrentPlayerCount').mockResolvedValue(2);
      jest.spyOn(playerService, 'getCurrentRoom').mockResolvedValue(currentRoom as any);
      
      // Act & Assert
      await expect(service.joinRoom(joinRoomDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('leaveRoom', () => {
    it('should allow a player to leave a room', async () => {
      // Arrange
      const leaveRoomDto = { playerId: '1', roomId: '1' };
      const existingPlayerRoom = { playerId: '1', roomId: '1', isActive: true, joinedAt: new Date() };
      
      jest.spyOn(roomService, 'findOne').mockResolvedValue(testRoom as Room);
      jest.spyOn(playerService, 'findById').mockResolvedValue(testPlayer as Player);
      jest.spyOn(playerRoomRepository, 'findOne').mockResolvedValue(existingPlayerRoom as PlayerRoom);
      
      // Act
      await service.leaveRoom(leaveRoomDto);
      
      // Assert
      expect(roomService.findOne).toHaveBeenCalledWith('1');
      expect(playerService.findById).toHaveBeenCalledWith('1');
      expect(playerRoomRepository.findOne).toHaveBeenCalledWith({
        where: {
          playerId: '1',
          roomId: '1',
          isActive: true,
        },
      });
      expect(service['dataSource'].createQueryRunner().manager.save).toHaveBeenCalledWith({
        ...existingPlayerRoom,
        isActive: false,
        leftAt: expect.any(Date),
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('player.room.left', expect.any(Object));
    });

    it('should throw BadRequestException when player is not in the room', async () => {
      // Arrange
      const leaveRoomDto = { playerId: '1', roomId: '1' };
      
      jest.spyOn(roomService, 'findOne').mockResolvedValue(testRoom as Room);
      jest.spyOn(playerService, 'findById').mockResolvedValue(testPlayer as Player);
      jest.spyOn(playerRoomRepository, 'findOne').mockResolvedValue(null);
      
      // Act & Assert
      await expect(service.leaveRoom(leaveRoomDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getRoomPlayers', () => {
    it('should return all active players in a room', async () => {
      // Arrange
      const roomId = '1';
      const activePlayersInRoom = [
        {
          playerId: '1',
          player: { username: 'user1', status: PlayerStatus.ONLINE },
          joinedAt: new Date(),
        },
        {
          playerId: '2',
          player: { username: 'user2', status: PlayerStatus.AWAY },
          joinedAt: new Date(),
        },
      ];
      
      jest.spyOn(roomService, 'findOne').mockResolvedValue(testRoom as Room);
      jest.spyOn(roomService, 'getActivePlayersInRoom').mockResolvedValue(activePlayersInRoom as any);
      
      // Act
      const result = await service.getRoomPlayers(roomId);
      
      // Assert
      expect(roomService.findOne).toHaveBeenCalledWith(roomId);
      expect(roomService.getActivePlayersInRoom).toHaveBeenCalledWith(roomId);
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({
          playerId: '1',
          username: 'user1',
          status: PlayerStatus.ONLINE,
        }),
        expect.objectContaining({
          playerId: '2',
          username: 'user2',
          status: PlayerStatus.AWAY,
        }),
      ]));
    });
  });

  describe('getPlayerRoomHistory', () => {
    it('should return the player room history with current room', async () => {
      // Arrange
      const playerId = '1';
      const currentRoom = {
        roomId: '1',
        room: { name: 'Current Room' },
        joinedAt: new Date(),
      };
      const previousRooms = [
        {
          roomId: '2',
          room: { name: 'Previous Room 1' },
          joinedAt: new Date(Date.now() - 60000),
          leftAt: new Date(),
        },
        {
          roomId: '3',
          room: { name: 'Previous Room 2' },
          joinedAt: new Date(Date.now() - 120000),
          leftAt: new Date(Date.now() - 60000),
        },
      ];
      
      jest.spyOn(playerService, 'findById').mockResolvedValue(testPlayer as Player);
      jest.spyOn(playerService, 'getCurrentRoom').mockResolvedValue(currentRoom as any);
      jest.spyOn(playerService, 'getPreviousRooms').mockResolvedValue(previousRooms as any);
      
      // Act
      const result = await service.getPlayerRoomHistory(playerId);
      
      // Assert
      expect(playerService.findById).toHaveBeenCalledWith(playerId);
      expect(playerService.getCurrentRoom).toHaveBeenCalledWith(playerId);
      expect(playerService.getPreviousRooms).toHaveBeenCalledWith(playerId);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(expect.objectContaining({
        roomId: '1',
        roomName: 'Current Room',
        isCurrent: true,
      }));
    });

    it('should return only previous rooms if player is not in any room', async () => {
      // Arrange
      const playerId = '1';
      const previousRooms = [
        {
          roomId: '2',
          room: { name: 'Previous Room 1' },
          joinedAt: new Date(Date.now() - 60000),
          leftAt: new Date(),
        },
      ];
      
      jest.spyOn(playerService, 'findById').mockResolvedValue(testPlayer as Player);
      jest.spyOn(playerService, 'getCurrentRoom').mockResolvedValue(null);
      jest.spyOn(playerService, 'getPreviousRooms').mockResolvedValue(previousRooms as any);
      
      // Act
      const result = await service.getPlayerRoomHistory(playerId);
      
      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].roomId).toBe('2');
      expect(result[0].isCurrent).toBeUndefined();
    });
  });
});
