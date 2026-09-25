import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Player } from '../player/player.entity';
import { PlayerStatus } from '../player/enums/player-status.enum';
import { PlayerRoom } from './entities/player-room.entity';

/** Player online status and room presence. */
@Injectable()
export class PlayerPresenceService {
  constructor(
    @InjectRepository(Player)
    private playerRepository: Repository<Player>,
    @InjectRepository(PlayerRoom)
    private playerRoomRepository: Repository<PlayerRoom>,
  ) {}

  async findById(id: string): Promise<Player> {
    const player = await this.playerRepository.findOne({ where: { id } });
    if (!player) {
      throw new NotFoundException(`Player with ID ${id} not found`);
    }
    return player;
  }

  async updateStatus(id: string, status: PlayerStatus): Promise<Player> {
    await this.playerRepository.update(id, { status });
    return this.findById(id);
  }

  async getCurrentRoom(playerId: string): Promise<PlayerRoom | null> {
    return this.playerRoomRepository.findOne({
      where: {
        playerId,
        isActive: true,
      },
      relations: ['room'],
    });
  }

  async getPreviousRooms(playerId: string): Promise<PlayerRoom[]> {
    return this.playerRoomRepository.find({
      where: {
        playerId,
        isActive: false,
      },
      relations: ['room'],
      order: {
        leftAt: 'DESC',
      },
    });
  }
}
