import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameSession } from '../game-session.entity';
import { GameStatus } from '../enums/game-status.enum';
import { CreateGameSessionDto } from '../dto/create-game-session.dto';

/** Persists game sessions for every game mode and for insights tracking. */
@Injectable()
export class GameSessionService {
  constructor(
    @InjectRepository(GameSession)
    private readonly sessionRepository: Repository<GameSession>,
  ) {}

  start(dto: CreateGameSessionDto): Promise<GameSession> {
    const { playerIds, metadata, ...fields } = dto;
    const session = this.sessionRepository.create({
      ...fields,
      status: GameStatus.IN_PROGRESS,
      startTime: new Date(),
      metadata: { ...metadata, ...(playerIds ? { playerIds } : {}) },
    });
    return this.sessionRepository.save(session);
  }

  async findOne(id: string): Promise<GameSession> {
    const session = await this.sessionRepository.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException(`Game session ${id} not found`);
    }
    return session;
  }

  getActiveSessions(): Promise<GameSession[]> {
    return this.sessionRepository.find({ where: { status: GameStatus.IN_PROGRESS } });
  }

  async isSessionActive(id: string): Promise<boolean> {
    const count = await this.sessionRepository.count({
      where: { id, status: GameStatus.IN_PROGRESS },
    });
    return count > 0;
  }

  /** Marks a session finished and stores its result in `metadata.result`. */
  async complete(id: string, result?: Record<string, any>, score?: number): Promise<GameSession> {
    const session = await this.findOne(id);
    session.status = GameStatus.COMPLETED;
    session.endTime = new Date();
    if (score !== undefined) {
      session.score = score;
    }
    if (result) {
      session.metadata = { ...session.metadata, result };
    }
    return this.sessionRepository.save(session);
  }

  async cancel(id: string): Promise<GameSession> {
    const session = await this.findOne(id);
    session.status = GameStatus.CANCELLED;
    session.endTime = new Date();
    return this.sessionRepository.save(session);
  }

  // Submit a guess for an ongoing game session.
  submitGuess() {
    // Implement submit guess logic
  }

  /** Stores an already-finished session reported by an external client. */
  record(data: {
    playerId: string;
    gameTitle: string;
    startTime: Date;
    endTime?: Date;
  }): Promise<GameSession> {
    const session = this.sessionRepository.create({
      status: data.endTime ? GameStatus.COMPLETED : GameStatus.IN_PROGRESS,
      startTime: data.startTime,
      endTime: data.endTime ?? null,
      metadata: { playerIds: [data.playerId], gameTitle: data.gameTitle },
    });
    return this.sessionRepository.save(session);
  }
}
