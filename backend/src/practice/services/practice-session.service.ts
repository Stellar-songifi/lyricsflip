// src/practice/services/practice-session.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PracticeSession } from '../entities/practice-session.entity';
import { User } from '../../user/user.entity';
import { PracticeItemService } from './practice-item.service';
import { CreateSessionDto } from '../dto/create-session.dto';
import { PracticeProgressService } from './practice-progress.service';

@Injectable()
export class PracticeSessionService {
  constructor(
    @InjectRepository(PracticeSession)
    private sessionRepository: Repository<PracticeSession>,
    private practiceItemService: PracticeItemService,
    private practiceProgressService: PracticeProgressService,
  ) {}

  async createSession(user: User, createSessionDto: CreateSessionDto): Promise<PracticeSession> {
    const session = this.sessionRepository.create({
      user,
      difficulty: createSessionDto.difficulty,
      genre: createSessionDto.genre,
    });

    return this.sessionRepository.save(session);
  }

  async getSessionById(id: string): Promise<PracticeSession> {
    const session = await this.sessionRepository.findOne({
      where: { id },
      relations: ['user', 'results', 'results.practiceItem'],
    });

    if (!session) {
      throw new NotFoundException(`Practice session with ID ${id} not found`);
    }

    return session;
  }

  async getUserSessions(userId: string): Promise<PracticeSession[]> {
    return this.sessionRepository.find({
      where: { user: { id: userId } },
      order: { startedAt: 'DESC' },
    });
  }

  async completeSession(id: string): Promise<PracticeSession> {
    const session = await this.getSessionById(id);
    
    if (session.isCompleted) {
      return session;
    }
    
    const now = new Date();
    const startTime = new Date(session.startedAt);
    const durationMinutes = Math.round((now.getTime() - startTime.getTime()) / 60000);
    
    session.isCompleted = true;
    session.completedAt = now;
    session.durationMinutes = durationMinutes;
    
    const savedSession = await this.sessionRepository.save(session);
    
    // Update user progress
    await this.practiceProgressService.updateProgressAfterSession(savedSession);
    
    return savedSession;
  }

  async getSessionItems(sessionId: string): Promise<PracticeItem[]> {
    const session = await this.getSessionById(sessionId);
    return this.practiceItemService.getItemsByDifficultyAndGenre(
      session.difficulty,
      session.genre,
    );
  }
}
