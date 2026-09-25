import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './providers/leaderboard.service';
import { LeaderboardRoundResult } from './entities/leaderboard-round-result.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LeaderboardRoundResult])],
  controllers: [LeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
