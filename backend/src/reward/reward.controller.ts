import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RewardService } from './providers/reward.service';

// Controller for managing rewards.
@ApiTags('reward')
@Controller('reward')
export class RewardController {
  constructor(private readonly rewardService: RewardService) {}

  // Retrieve the list of available rewards.
  @Get()
  @ApiOperation({
    deprecated: true,
    summary: 'Get available rewards',
    description: 'Retrieve list of all available rewards',
  })
  @ApiResponse({
    status: 200,
    description: 'List of rewards successfully retrieved',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error occurred',
  })
  getRewards() {
    return this.rewardService.getRewards();
  }

  // Claim a specific reward.
  @Post('claim')
  @ApiOperation({
    deprecated: true,
    summary: 'Claim a reward',
    description: 'Process a reward claim with provided details',
  })
  //@ApiBody({ type: ClaimRewardDto })
  @ApiResponse({
    status: 200,
    description: 'Reward successfully claimed',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid reward claim details',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error occurred',
  })
  claimReward() {
    return this.rewardService.claimReward();
  }
}
