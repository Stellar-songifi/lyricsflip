import { Injectable, Logger } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import type { Repository } from "typeorm"
import { SongCategoryMetric } from "../entities/song-category.entity"
import type { DateRangeDto } from "../dto/date-range.dto"

@Injectable()
export class SongAnalyticsService {
  private readonly logger = new Logger(SongAnalyticsService.name);

  constructor(
    @InjectRepository(SongCategoryMetric)
    private readonly repository: Repository<SongCategoryMetric>,
  ) {}

  async getPopularCategories(dateRange: DateRangeDto) {
    try {
      const metrics = await this.repository
        .createQueryBuilder("category")
        .where("category.timestamp BETWEEN :startDate AND :endDate", {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        })
        .orderBy("category.playCount", "DESC")
        .getMany()

      return this.processCategoryMetrics(metrics)
    } catch (error) {
      this.logger.error(`Error fetching song category metrics: ${error.message}`)
      throw error
    }
  }

  private processCategoryMetrics(metrics: SongCategoryMetric[]) {
    const categoryStats = metrics.reduce((acc, metric) => {
      if (!acc[metric.categoryId]) {
        acc[metric.categoryId] = {
          categoryId: metric.categoryId,
          categoryName: metric.categoryName,
          totalPlays: 0,
          uniqueUsers: new Set(),
          totalPlayTime: 0,
          samples: 0,
        }
      }

      acc[metric.categoryId].totalPlays += metric.playCount
      const trendData = metric.popularityTrend as any;
      trendData?.userIds?.forEach((userId: string) => acc[metric.categoryId].uniqueUsers.add(userId))
      acc[metric.categoryId].totalPlayTime += metric.averagePlayTime
      acc[metric.categoryId].samples += 1

      return acc
    }, {} as Record<string, { categoryId: string; categoryName: string; totalPlays: number; uniqueUsers: Set<string>; totalPlayTime: number; samples: number }>)

    return Object.values(categoryStats).map((stat) => ({
      categoryId: stat.categoryId,
      categoryName: stat.categoryName,
      totalPlays: stat.totalPlays,
      uniqueUsers: stat.uniqueUsers.size,
      averagePlayTime: stat.totalPlayTime / stat.samples,
      timestamp: new Date(),
    }))
  }
}

