import { Injectable, Logger } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import type { Repository } from "typeorm"
import { UserProgressionMetric } from "../entities/user-progression.entity"
import type { DateRangeDto } from "../dto/date-range.dto"

@Injectable()
export class UserProgressionService {
  private readonly logger = new Logger(UserProgressionService.name);

  constructor(
    @InjectRepository(UserProgressionMetric)
    private readonly repository: Repository<UserProgressionMetric>,
  ) {}

  async getTrends(dateRange: DateRangeDto) {
    try {
      const metrics = await this.repository
        .createQueryBuilder("progression")
        .where("progression.timestamp BETWEEN :startDate AND :endDate", {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        })
        .orderBy("progression.timestamp", "ASC")
        .getMany()

      return this.processProgressionMetrics(metrics)
    } catch (error) {
      this.logger.error(`Error fetching user progression metrics: ${error.message}`)
      throw error
    }
  }

  private processProgressionMetrics(metrics: UserProgressionMetric[]) {
    if (!metrics.length) {
      return {
        averageLevel: 0,
        totalUsers: 0,
        levelDistribution: {},
        achievementStats: {},
        progressionTrends: [],
        timestamp: new Date(),
      }
    }

    const userStats = metrics.reduce(
      (acc, metric) => {
        if (!acc.levels[metric.level]) {
          acc.levels[metric.level] = 0
        }
        acc.levels[metric.level]++

        metric.achievements.forEach((achievement) => {
          if (!acc.achievements[achievement]) {
            acc.achievements[achievement] = 0
          }
          acc.achievements[achievement]++
        })

        acc.totalLevel += metric.level
        acc.userCount++

        return acc
      },
      { levels: {}, achievements: {}, totalLevel: 0, userCount: 0 },
    )

    return {
      averageLevel: userStats.totalLevel / userStats.userCount,
      totalUsers: userStats.userCount,
      levelDistribution: userStats.levels,
      achievementStats: userStats.achievements,
      progressionTrends: this.calculateProgressionTrends(metrics),
      timestamp: new Date(),
    }
  }

  private calculateProgressionTrends(metrics: UserProgressionMetric[]) {
    // Group metrics by day and calculate average levels
    const dailyAverages = metrics.reduce((acc, metric) => {
      const date = metric.timestamp.toISOString().split("T")[0]
      if (!acc[date]) {
        acc[date] = { total: 0, count: 0 }
      }
      acc[date].total += metric.level
      acc[date].count++
      return acc
    }, {} as Record<string, { total: number; count: number }>)

    return Object.entries(dailyAverages).map(([date, stats]) => ({
      date,
      averageLevel: stats.total / stats.count,
    }))
  }
}

