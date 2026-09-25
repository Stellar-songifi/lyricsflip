import { Controller, Get, Query, UseGuards, UseInterceptors, ValidationPipe } from "@nestjs/common"
import { CacheInterceptor } from "@nestjs/cache-manager"
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger"
import type { PlayerEngagementService } from "../../player-engagement/player-engagement.service"
import type { SongAnalyticsService } from "../services/song-analytics.service"
import type { TokenAnalyticsService } from "../services/token-analytics.service"
import type { UserProgressionService } from "../services/user-progression.service"
import type { AnalyticsAggregatorService } from "../services/analytics-aggregator.service"
import type { DateRangeDto } from "../dto/date-range.dto"
import { AnalyticsResponseDto } from "../dto/analytics-response.dto"
import { AnalyticsAuthGuard } from "../guards/analytics-auth.guard"
import { AnalyticsRolesGuard } from "../guards/analytics-roles.guard"
import { AnalyticsRoles } from "../decorators/analytics-roles.decorator"
import { AnalyticsRole } from "../enums/analytics-role.enum"

@ApiTags("Analytics")
@Controller("analytics")
@UseGuards(AnalyticsAuthGuard, AnalyticsRolesGuard)
@UseInterceptors(CacheInterceptor)
export class AnalyticsController {
  constructor(
    private readonly playerEngagementService: PlayerEngagementService,
    private readonly songAnalyticsService: SongAnalyticsService,
    private readonly tokenAnalyticsService: TokenAnalyticsService,
    private readonly userProgressionService: UserProgressionService,
    private readonly analyticsAggregator: AnalyticsAggregatorService,
  ) {}

  @Get('player-engagement')
  @AnalyticsRoles(AnalyticsRole.ANALYST, AnalyticsRole.ADMIN)
  @ApiOperation({ summary: 'Get player engagement metrics' })
  @ApiResponse({ status: 200, type: AnalyticsResponseDto })
  async getPlayerEngagement(@Query(ValidationPipe) dateRange: DateRangeDto) {
    return this.playerEngagementService.getMetrics(dateRange);
  }

  @Get('song-categories')
  @AnalyticsRoles(AnalyticsRole.ANALYST, AnalyticsRole.ADMIN)
  @ApiOperation({ summary: 'Get popular song categories' })
  @ApiResponse({ status: 200, type: AnalyticsResponseDto })
  async getSongCategories(@Query(ValidationPipe) dateRange: DateRangeDto) {
    return this.songAnalyticsService.getPopularCategories(dateRange);
  }

  @Get('token-economy')
  @AnalyticsRoles(AnalyticsRole.ANALYST, AnalyticsRole.ADMIN)
  @ApiOperation({ summary: 'Get token economy statistics' })
  @ApiResponse({ status: 200, type: AnalyticsResponseDto })
  async getTokenEconomyStats(@Query(ValidationPipe) dateRange: DateRangeDto) {
    return this.tokenAnalyticsService.getStatistics(dateRange);
  }

  @Get('user-progression')
  @AnalyticsRoles(AnalyticsRole.ANALYST, AnalyticsRole.ADMIN)
  @ApiOperation({ summary: 'Get user progression trends' })
  @ApiResponse({ status: 200, type: AnalyticsResponseDto })
  async getUserProgressionTrends(@Query(ValidationPipe) dateRange: DateRangeDto) {
    return this.userProgressionService.getTrends(dateRange);
  }

  @Get('aggregate')
  @AnalyticsRoles(AnalyticsRole.ANALYST, AnalyticsRole.ADMIN)
  @ApiOperation({ summary: 'Get aggregated analytics' })
  @ApiResponse({ status: 200, type: AnalyticsResponseDto })
  async getAggregatedAnalytics(@Query(ValidationPipe) dateRange: DateRangeDto) {
    return this.analyticsAggregator.getAggregatedData(dateRange);
  }
}

