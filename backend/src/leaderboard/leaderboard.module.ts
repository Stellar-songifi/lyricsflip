import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './providers/leaderboard.service';
import { LeaderboardRoundResult } from './entities/leaderboard-round-result.entity';
import { ChainRoundResult } from '../indexer/entities/chain-round-result.entity';
import { ChainRound } from '../indexer/entities/chain-round.entity';
import { ChainNft } from '../indexer/entities/chain-nft.entity';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeaderboardRoundResult,
      ChainRoundResult,
      ChainRound,
      ChainNft,
    ]),
    RedisModule,
  ],
  controllers: [LeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
