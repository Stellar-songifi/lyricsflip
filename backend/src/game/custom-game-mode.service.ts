import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { CreateCustomGameModeDto } from './dtos/create-custom-game-mode.dto';
import { CustomGameMode } from './entities/custom-game-mode.entity';

@Injectable()
export class CustomGameModeService {
  constructor(
    @InjectRepository(CustomGameMode)
    private readonly customModeRepository: Repository<CustomGameMode>,
  ) {}

  create(data: CreateCustomGameModeDto, creatorId: string) {
    const mode = this.customModeRepository.create({
      ...data,
      creator: { id: creatorId } as User,
    });
    return this.customModeRepository.save(mode);
  }

  findAll() {
    return this.customModeRepository.find({ relations: ['creator'] });
  }

  upvote(id: string) {
    return this.customModeRepository.increment({ id }, 'votes', 1);
  }
}
