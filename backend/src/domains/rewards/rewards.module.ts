import { Module } from '@nestjs/common';
import { AchievementModule } from '../../achievement/achievement.module';
import { ProgressionModule } from '../../progression/progression.module';
import { RewardModule } from '../../reward/reward.module';
import { RewardsController } from './rewards.controller';

@Module({
  imports: [RewardModule, AchievementModule, ProgressionModule],
  controllers: [RewardsController],
  exports: [RewardModule, AchievementModule, ProgressionModule],
})
export class RewardsModule {}
