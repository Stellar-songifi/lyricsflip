import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameInsightsService } from './provider/game-insights/game-insights.service';
import { GameInsightsController } from './game-insights.controller';
import { UserBehavior } from './UserBehavior';
import { PlayerPerformance } from './PlayerPerformance';
import { GameSessionModule } from '../game-session/game-session.module';

@Module({
  imports: [TypeOrmModule.forFeature([PlayerPerformance, UserBehavior]), GameSessionModule],
  controllers: [GameInsightsController],
  providers: [GameInsightsService],
})
export class GameInsightsModule {}
