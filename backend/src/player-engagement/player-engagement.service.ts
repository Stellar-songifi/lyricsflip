import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { PlayerEngagementMetric } from "../analytics/entities/player-engagement.entity";
import { UserActivity } from "@app/user/user-activity.entity";
import type { DateRangeDto } from "../analytics/dto/date-range.dto";
import type { PlayerEngagementDto } from "../analytics/dto/player-engagement.dto";

@Injectable()
export class PlayerEngagementService {
  private readonly logger = new Logger(PlayerEngagementService.name);

  constructor(
    @InjectRepository(PlayerEngagementMetric)
    private readonly repository: Repository<PlayerEngagementMetric>,
    @InjectRepository(UserActivity)
    private readonly userActivityRepository: Repository<UserActivity>,
  ) {}

  async getMetrics(dateRange: DateRangeDto): Promise<PlayerEngagementDto> {
    try {
      const metrics = await this.repository
        .createQueryBuilder("engagement")
        .where("engagement.timestamp BETWEEN :startDate AND :endDate", {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        })
        .getMany();

      return this.processMetrics(metrics);
    } catch (error) {
      this.logger.error(`Error fetching player engagement metrics: ${error.message}`);
      throw error;
    }
  }

  private processMetrics(metrics: PlayerEngagementMetric[]): PlayerEngagementDto {
    const totalSessions = metrics.reduce((sum, metric) => sum + metric.sessionCount, 0);
    const activeUsers = new Set(metrics.map((metric) => metric.userId)).size;
    const averageSessionDuration = metrics.reduce((sum, metric) => sum + metric.sessionDuration, 0) / metrics.length;

    return {
      totalSessions,
      activeUsers,
      averageSessionDuration,
      retentionRate: this.calculateRetentionRate(metrics),
      peakActivityHours: this.calculatePeakHours(metrics),
      timestamp: new Date(),

      
    };
  }

  private calculateRetentionRate(metrics: PlayerEngagementMetric[]): number {
    const uniqueUsers = new Set(metrics.map((metric) => metric.userId)).size;
    return uniqueUsers / metrics.length;
  }

  private calculatePeakHours(metrics: PlayerEngagementMetric[]): number[] {
    const hourCounts: { [key: number]: number } = {};
    metrics.forEach((metric) => {
      const hour = new Date(metric.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    return Object.keys(hourCounts)
      .map(Number)
      .sort((a, b) => hourCounts[b] - hourCounts[a]);
  }

  async updateUserActivity(userId: string, sessionDuration: number): Promise<void> {
    try {
      let userActivity = await this.userActivityRepository.findOne({ where: { user: { id: userId } } });

      if (!userActivity) {
        userActivity = this.userActivityRepository.create({ user: { id: userId }, totalSessions: 1, totalSessionDuration: sessionDuration });
      } else {
        userActivity.totalSessions += 1;
        userActivity.totalSessionDuration += sessionDuration;
        userActivity.lastActiveAt = new Date();
      }

      await this.userActivityRepository.save(userActivity);
    } catch (error) {
      this.logger.error(`Error updating user activity: ${error.message}`);
      throw error;
    }
  }

  async getRetentionMetrics(dateRange: DateRangeDto): Promise<{ retentionRates: number[]; totalUsers: number }> {
    try {
      const userActivities = await this.userActivityRepository
        .createQueryBuilder("activity")
        .where("activity.firstActiveAt BETWEEN :startDate AND :endDate", {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        })
        .getMany();
  
      const totalUsers = userActivities.length;
      const retentionRates = this.calculateRetention(userActivities);
  
      return { retentionRates, totalUsers };
    } catch (error) {
      this.logger.error(`Error fetching retention metrics: ${error.message}`);
      throw error;
    }
  }
  
  private calculateRetention(userActivities: UserActivity[]): number[] {
    const retentionBuckets = [1, 7, 30]; // Track 1-day, 7-day, and 30-day retention
    const retentionCounts = retentionBuckets.map(() => 0);
  
    userActivities.forEach((activity) => {
      retentionBuckets.forEach((days, index) => {
        if (activity.retentionDays.includes(days)) {
          retentionCounts[index] += 1;
        }
      });
    });
  
    return retentionCounts.map((count) => (count / userActivities.length) * 100); // Return retention as percentages
  }
  
}
