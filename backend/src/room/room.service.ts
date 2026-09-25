import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { Room } from './entities/room.entity';
import { PlayerRoom } from './entities/player-room.entity';

@Injectable()
export class RoomService {
  constructor(
    @InjectRepository(Room)
    private roomRepository: Repository<Room>,
    @InjectRepository(PlayerRoom)
    private playerRoomRepository: Repository<PlayerRoom>,
  ) {}

  private generateRoomCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase().padEnd(6, '0');
  }

  create(createRoomDto: CreateRoomDto) {
    const room = this.roomRepository.create({
      ...createRoomDto,
      code: this.generateRoomCode(),
    });
    return this.roomRepository.save(room);
  }

  findAll(limit = 20, page = 1): Promise<Room[]> {
    return this.roomRepository.find({
      where: { isActive: true },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async findOne(id: string): Promise<Room> {
    const room = await this.roomRepository.findOne({ where: { id, isActive: true } });
    if (!room) {
      throw new NotFoundException(`Room with ID ${id} not found`);
    }
    return room;
  }

  async update(id: string, updateRoomDto: UpdateRoomDto) {
    const room = await this.findOne(id);
    Object.assign(room, updateRoomDto);
    return this.roomRepository.save(room);
  }

  async remove(id: string) {
    const room = await this.findOne(id);
    room.isActive = false;
    return this.roomRepository.save(room);
  }

  getCurrentPlayerCount(roomId: string): Promise<number> {
    return this.playerRoomRepository.count({ where: { roomId, isActive: true } });
  }

  getActivePlayersInRoom(roomId: string): Promise<PlayerRoom[]> {
    return this.playerRoomRepository.find({
      where: { roomId, isActive: true },
      relations: ['player'],
    });
  }
}
