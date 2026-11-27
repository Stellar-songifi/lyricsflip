import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { GameModule } from '../../game/game.module';
import { GameResultsModule } from '../../game-results/game-results.module';
import { GameSessionModule } from '../../game-session/game-session.module';
import { IndexerModule } from '../../indexer/indexer.module';
import { QuickGameModule } from '../../quick-game/quick-game.module';
import { RoomModule } from '../../room/room.module';
import { ScoringModule } from '../../scoring/scoring.module';
import { WagerModule } from '../../wager/wager.module';
import { RedisModule } from '../../redis/redis.module';
import { RoundsController } from './rounds.controller';
import { RoundsReadController } from './rounds-read.controller';
import { RoundsReadService } from './providers/rounds-read.service';

@Module({
  imports: [
    GameModule,
    GameResultsModule,
    GameSessionModule,
    IndexerModule,
    QuickGameModule,
    RoomModule,
    ScoringModule,
    WagerModule,
    RedisModule,
    // RoundsController is guarded by the exported AccessTokenGuard, which
    // needs JwtService and CONFIGURATION(jwt) from AuthModule.
    forwardRef(() => AuthModule),
  ],
  controllers: [RoundsController, RoundsReadController],
  providers: [RoundsReadService],
  exports: [
    GameModule,
    GameSessionModule,
    IndexerModule,
    QuickGameModule,
    RoomModule,
    ScoringModule,
    WagerModule,
    RoundsReadService,
  ],
})
export class RoundsModule {}
