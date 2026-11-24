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
import { LeaderboardBoardService } from './providers/leaderboard-board.service';
import { AntiCheatModule } from '../anti-cheat/anti-cheat.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaderboardRoundResult]),
    forwardRef(() => IndexerModule),
    forwardRef(() => AntiCheatModule),
    RedisModule,
  ],
  controllers: [LeaderboardController, PlayersController],
  providers: [LeaderboardService, LeaderboardBoardService],
  exports: [LeaderboardService, LeaderboardBoardService],
})
export class LeaderboardModule {}
