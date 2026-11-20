import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndexerModule } from '../indexer/indexer.module';
import { RedisModule } from '../redis/redis.module';
import {
  LeaderboardController,
  PlayersController,
} from './leaderboard.controller';
import { LeaderboardRoundResult } from './entities/leaderboard-round-result.entity';
import { LeaderboardService } from './providers/leaderboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaderboardRoundResult]),
    forwardRef(() => IndexerModule),
    RedisModule,
  ],
  controllers: [LeaderboardController, PlayersController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
