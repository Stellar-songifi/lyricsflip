import { Module } from '@nestjs/common';
import { LeaderboardModule } from '../../leaderboard/leaderboard.module';
import { SocialFeatureModule } from '../../social/social.module';
import { ReferralModule } from '../../referral/referral.module';

@Module({
  imports: [LeaderboardModule, SocialFeatureModule, ReferralModule],
  exports: [LeaderboardModule, SocialFeatureModule, ReferralModule],
})
export class SocialModule {}
