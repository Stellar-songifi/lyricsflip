import { Module } from '@nestjs/common';
import { LeaderboardModule } from '../../leaderboard/leaderboard.module';
import { SocialFeatureModule } from '../../social/social.module';

@Module({
  imports: [LeaderboardModule, SocialFeatureModule],
  exports: [LeaderboardModule, SocialFeatureModule],
})
export class SocialModule {}
