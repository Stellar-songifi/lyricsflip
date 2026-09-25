import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ShareService } from './share.service';
import { ShareController } from './share.controller';
import { ShareNotificationService } from './share-notification.service';
import { Share } from './entities/share.entity';
import { ShareAnalytics } from './entities/share-analytics.entity';
import { NotificationModule } from '../../notification/notification.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Share, ShareAnalytics]),
    ThrottlerModule.forRoot({
      ttl: 60,
      limit: 10,
    }),
    NotificationModule,
    ActivityModule,
  ],
  controllers: [ShareController],
  providers: [ShareService, ShareNotificationService],
  exports: [ShareService],
})
export class ShareModule {}
