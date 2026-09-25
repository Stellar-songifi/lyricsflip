import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PlayerEngagementService } from "@app/player-engagement/player-engagement.service";
import { DateRangeDto } from "@app/analytics/dto/date-range.dto";
import { PlayerEngagementDto } from "@app/analytics/dto/player-engagement.dto";

@ApiTags("player-engagement")
@Controller("player-engagement")
export class PlayerEngagementController {
  constructor(private readonly playerEngagementService: PlayerEngagementService) {}

  @Get("metrics")
  async getMetrics(@Query() dateRange: DateRangeDto): Promise<PlayerEngagementDto> {
    return this.playerEngagementService.getMetrics(dateRange);
  }

  @Get("retention")
  async getRetentionMetrics(@Query() dateRange: DateRangeDto): Promise<{ retentionRates: number[]; totalUsers: number }> {
    return this.playerEngagementService.getRetentionMetrics(dateRange);
  }
}
