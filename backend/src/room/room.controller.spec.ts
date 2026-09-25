import { Test, TestingModule } from '@nestjs/testing';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';
import { RoomMembershipService } from './room-membership.service';
import { PlayerPresenceService } from './player-presence.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { NotFoundException } from '@nestjs/common';

describe('RoomController', () => {
  let controller: RoomController;
  let service: RoomService;

  const mockRoomService = {
    create: jest.fn().mockResolvedValue({
      id: '1',
      name: 'Test Room Name',
      code: 'RANDOM',
      description: 'Test Room Description',
    }),
    // create: jest.fn().mockImplementation((dto) => ({ id: '1', ...dto })),
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockImplementation((id) => {
      if (id === '1')
        return Promise.resolve({
          id: '1',
          name: 'Test Room Name',
          description: 'Test Room Description',
          code: 'RANDOM',
        });
      throw new NotFoundException('Room not found');
    }),
    update: jest.fn().mockImplementation((id, dto) => {
      if (id === '1') return Promise.resolve({ id: '1', ...dto });
      throw new NotFoundException('Room not found');
    }),
    remove: jest.fn().mockImplementation((id) => {
      if (id === '1') return Promise.resolve(true);
      throw new NotFoundException('Room not found');
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoomController],
      providers: [
        { provide: RoomService, useValue: mockRoomService },
        { provide: RoomMembershipService, useValue: { joinRoom: jest.fn(), leaveRoom: jest.fn() } },
        { provide: PlayerPresenceService, useValue: {} },
      ],
    }).compile();

    controller = module.get<RoomController>(RoomController);
    service = module.get<RoomService>(RoomService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create a room', async () => {
    const dto: CreateRoomDto = {
      name: 'Test Room Name',
      description: 'Test Room Description',
    };
    await expect(controller.create(dto)).resolves.toEqual({
      id: '1',
      name: 'Test Room Name',
      code: 'RANDOM',
      description: 'Test Room Description',
    });
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('should return all rooms', async () => {
    await expect(controller.findAll(20, 1)).resolves.toEqual([]);
    expect(service.findAll).toHaveBeenCalledWith(20, 1);
  });

  it('should return a room by id', async () => {
    await expect(controller.findOne('1')).resolves.toEqual({
      id: '1',
      name: 'Test Room Name',
      description: 'Test Room Description',
      code: 'RANDOM',
    });
    expect(service.findOne).toHaveBeenCalledWith('1');
  });

  it('should throw an error if room not found', async () => {
    try {
      await controller.findOne('2');
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
    }
  });

  it('should update a room', async () => {
    const updateDto: UpdateRoomDto = {
      name: 'Updated Room',
      description: 'Test Room Description'
    };
    await expect(controller.update('1', updateDto)).resolves.toEqual({
      id: '1',
      ...updateDto,
    });
    expect(service.update).toHaveBeenCalledWith('1', updateDto);
  });

  it('should throw an error if updating a non-existent room', async () => {
    const updateDto: UpdateRoomDto = {
      name: 'Updated Room',
      description: 'Test Room Description'
    };
    try {
      await expect(controller.update('2', updateDto));
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
    }
  });

  it('should delete a room', async () => {
    await expect(controller.remove('1')).resolves.toBeTruthy();
    expect(service.remove).toHaveBeenCalledWith('1');
  });

  it('should throw an error if deleting a non-existent room', async () => {
    try {
      await expect(controller.remove('2'));
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
    }
  });
});
