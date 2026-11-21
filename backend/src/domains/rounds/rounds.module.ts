import { Module } from '@nestjs/common';
import { GameModule } from '../../game/game.module';
import { GameResultsModule } from '../../game-results/game-results.module';
import { GameSessionModule } from '../../game-session/game-session.module';
import { IndexerModule } from '../../indexer/indexer.module';
import { QuickGameModule } from '../../quick-game/quick-game.module';
import { RoomModule } from '../../room/room.module';
import { ScoringModule } from '../../scoring/scoring.module';
import { WagerModule } from '../../wager/wager.module';
import { RoundsController } from './rounds.controller';

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
  ],
  controllers: [RoundsController],
  exports: [
    GameModule,
    GameSessionModule,
    IndexerModule,
    QuickGameModule,
    RoomModule,
    ScoringModule,
    WagerModule,
  ],
})
export class RoundsModule {}
