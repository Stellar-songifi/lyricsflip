import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RewardService } from '../../reward/providers/reward.service';

@ApiTags('rewards')
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardService: RewardService) {}

  @Get()
  @ApiOperation({ summary: 'Get available rewards' })
  getRewards() {
    return this.rewardService.getRewards();
  }

  @Post('claim')
  @ApiOperation({ summary: 'Claim a reward' })
  claimReward() {
    return this.rewardService.claimReward();
  }
}
