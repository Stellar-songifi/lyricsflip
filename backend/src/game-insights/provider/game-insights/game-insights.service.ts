import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameSessionService } from '../../../game-session/providers/game-session.service';
import { PlayerPerformance } from '../../PlayerPerformance';
import { UserBehavior } from '../../UserBehavior';
import { CreateGameSessionDto } from '../../DTO/CreateGameSessionDto';
import { CreatePlayerPerformanceDto } from '../../DTO/CreatePlayerPerformanceDto';
import { CreateUserBehaviorDto } from '../../DTO/CreateUserBehaviorDto';

@Injectable()
export class GameInsightsService {
  constructor(
    private readonly gameSessionService: GameSessionService,

    @InjectRepository(PlayerPerformance)
    private playerPerformanceRepo: Repository<PlayerPerformance>,

    @InjectRepository(UserBehavior)
    private userBehaviorRepo: Repository<UserBehavior>,
  ) {}

  async trackGameSession(data: CreateGameSessionDto) {
    return this.gameSessionService.record(data);
  }

  async trackPlayerPerformance(data: CreatePlayerPerformanceDto) {
    return await this.playerPerformanceRepo.save(data);
  }

  async trackUserBehavior(data: CreateUserBehaviorDto) {
    return await this.userBehaviorRepo.save(data);
  }
}
