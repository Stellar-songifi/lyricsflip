import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../../analytics/analytics.module';
import { SongsModule } from '../../songs/songs.module';
import { AdminSongsController } from './admin-songs.controller';

@Module({
  imports: [AnalyticsModule, SongsModule],
  controllers: [AdminSongsController],
  exports: [AnalyticsModule],
})
export class AdminModule {}
