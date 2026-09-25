import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LessonProgress } from '../entities/lesson-progress.entity';

@Injectable()
export class LessonProgressService {
  constructor(
    @InjectRepository(LessonProgress)
    private readonly progressRepo: Repository<LessonProgress>,
  ) {}

  findAll() {
    return this.progressRepo.find();
  }

  findByUser(userId: string) {
    return this.progressRepo.find({ where: { user: { id: userId } } });
  }

  markComplete(progressId: number) {
    return this.progressRepo.update(progressId, { completed: true });
  }
}
