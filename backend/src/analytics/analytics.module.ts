import { Module } from "@nestjs/common"
import { CacheModule } from "@nestjs/cache-manager"
import { TypeOrmModule } from "@nestjs/typeorm"
import { AnalyticsController } from "./controllers/analytics.controller"
import { OnboardingFunnelController } from "./controllers/onboarding-funnel.controller"
import { PlayerEngagementService } from "../player-engagement/player-engagement.service"
import { SongAnalyticsService } from "./services/song-analytics.service"
import { TokenAnalyticsService } from "./services/token-analytics.service"
import { UserProgressionService } from "./services/user-progression.service"
import { AnalyticsAggregatorService } from "./services/analytics-aggregator.service"
import { PlayerEngagementMetric } from "./entities/player-engagement.entity"
import { SongCategoryMetric } from "./entities/song-category.entity"
import { TokenMetric } from "./entities/token.entity"
import { UserProgressionMetric } from "./entities/user-progression.entity"
import { OnboardingFunnelMetric } from "./entities/onboarding-funnel-metric.entity"
import { AnalyticsRepository } from "./repositories/analytics.repository"
import { OnboardingFunnelService } from "./services/onboarding-funnel.service"
import { AnalyticsAuthGuard } from "./guards/analytics-auth.guard"
import { AnalyticsRolesGuard } from "./guards/analytics-roles.guard"

@Module({
  imports: [
    CacheModule.register({
      ttl: 300, // 5 minutes cache
    }),
    TypeOrmModule.forFeature([PlayerEngagementMetric, SongCategoryMetric, TokenMetric, UserProgressionMetric, OnboardingFunnelMetric]),
  ],
  controllers: [AnalyticsController, OnboardingFunnelController],
  providers: [
    PlayerEngagementService,
    SongAnalyticsService,
    TokenAnalyticsService,
    UserProgressionService,
    AnalyticsAggregatorService,
    OnboardingFunnelService,
    AnalyticsRepository,
    AnalyticsAuthGuard,
    AnalyticsRolesGuard,
  ],
  exports: [
    PlayerEngagementService,
    SongAnalyticsService,
    TokenAnalyticsService,
    UserProgressionService,
    AnalyticsAggregatorService,
  ],
})
export class AnalyticsModule {}
