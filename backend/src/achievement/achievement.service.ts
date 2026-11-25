// src/achievement/achievement.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { CreateAchievementDto } from './dto/create-achievement.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AchievementService {
  constructor(
    @InjectRepository(Achievement)
    private achievementRepository: Repository<Achievement>,
    @InjectRepository(UserAchievement)
    private userAchievementRepository: Repository<UserAchievement>,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(
    createAchievementDto: CreateAchievementDto,
  ): Promise<Achievement> {
    const achievement = this.achievementRepository.create(createAchievementDto);
    return this.achievementRepository.save(achievement);
  }

  async trackProgress(
    userId: string,
    eventType: string,
    eventData: any,
  ): Promise<void> {
    const relevantAchievements = await this.achievementRepository.find({
      where: {} as any,
    });
    // filter in JS since nested JSON criteria can't use FindOptionsWhere directly
    const filtered = relevantAchievements.filter(
      (a) => (a.criteria as any)?.eventType === eventType,
    );

    for (const achievement of filtered) {
      const userAchievement = await this.getUserAchievement(
        userId,
        achievement.id,
      );
      if (userAchievement.isCompleted) continue;

      const newProgress = await this.calculateProgress(
        achievement,
        userAchievement,
        eventData,
      );
      userAchievement.progress = newProgress;

      if (newProgress >= 1) {
        await this.unlockAchievement(userId, achievement.id);
      } else {
        await this.userAchievementRepository.save(userAchievement);
      }
    }
  }

  async unlockAchievement(
    userId: string,
    achievementId: string,
  ): Promise<void> {
    const userAchievement = await this.getUserAchievement(
      userId,
      achievementId,
    );
    if (userAchievement.isCompleted) return;

    userAchievement.isCompleted = true;
    userAchievement.progress = 1;
    userAchievement.unlockedAt = new Date();
    await this.userAchievementRepository.save(userAchievement);

    const achievement = await this.achievementRepository.findOne({
      where: { id: achievementId },
    });
    this.eventEmitter.emit('achievement.unlocked', {
      userId,
      achievement,
      unlockedAt: userAchievement.unlockedAt,
    });
  }

  private async getUserAchievement(
    userId: string,
    achievementId: string,
  ): Promise<UserAchievement> {
    let userAchievement = await this.userAchievementRepository.findOne({
      where: {
        user: { id: userId },
        achievement: { id: achievementId },
      },
    });

    if (!userAchievement) {
      userAchievement = this.userAchievementRepository.create({
        user: { id: userId },
        achievement: { id: achievementId },
        progress: 0,
      });
      await this.userAchievementRepository.save(userAchievement);
    }

    return userAchievement;
  }

  private async calculateProgress(
    achievement: Achievement,
    userAchievement: UserAchievement,
    eventData: any,
  ): Promise<number> {
    // Implement progress calculation based on achievement criteria
    // This is a simplified example
    const currentProgress = userAchievement.progress;
    const increment = this.evaluateCriteria(achievement.criteria, eventData);
    return Math.min(1, currentProgress + increment);
  }

  private evaluateCriteria(
    criteria: Record<string, any>,
    eventData: any,
  ): number {
    // Implement criteria evaluation logic
    // This is a simplified example
    return 0.1; // Return progress increment
  }

  async getUserAchievements(userId: string): Promise<UserAchievement[]> {
    return this.userAchievementRepository.find({
      where: { user: { id: userId } } as any,
      relations: ['achievement', 'user'],
    });
  }

  async getLeaderboard(): Promise<{ userId: string; count: number }[]> {
    const results = await this.userAchievementRepository
      .createQueryBuilder('ua')
      .innerJoin('ua.user', 'user')
      .select('user.id', 'userId')
      .addSelect('COUNT(ua.id)', 'count')
      .where('ua.isCompleted = :completed', { completed: true })
      .groupBy('user.id')
      .orderBy('count', 'DESC')
      .limit(100)
      .getRawMany();
    return results;
  }
}
