import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../../analytics/analytics.module';
import { SongsModule } from '../../songs/songs.module';
import { AntiCheatModule } from '../../anti-cheat/anti-cheat.module';
import { AdminSongsController } from './admin-songs.controller';

@Module({
  imports: [AnalyticsModule, SongsModule, AntiCheatModule],
  controllers: [AdminSongsController],
  exports: [AnalyticsModule],
})
export class AdminModule {}
