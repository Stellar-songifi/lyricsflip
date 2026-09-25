// social.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FriendController } from './controllers/friend.controller';
import { ProfileController } from './controllers/profile.controller';
import { ActivityController } from './controllers/activity.controller';
import { ChallengeController } from './controllers/challenge.controller';
import { FriendService } from './services/friend.service';
import { ProfileService } from './services/profile.service';
import { ActivityService } from './services/activity.service';
import { ChallengeService } from './services/challenge.service';
import { Friend } from './entities/friend.entity';
import { Profile } from './entities/profile.entity';
import { Activity } from './entities/activity.entity';
import { Challenge } from './entities/challenge.entity';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Friend,
      Profile,
      Activity,
      Challenge,
    ]),
    NotificationModule,
  ],
  controllers: [
    FriendController,
    ProfileController,
    ActivityController,
    ChallengeController,
  ],
  providers: [
    FriendService,
    ProfileService,
    ActivityService,
    ChallengeService,
  ],
})
export class SocialModule {}