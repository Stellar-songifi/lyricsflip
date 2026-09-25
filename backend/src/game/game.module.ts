import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassicModeService } from './game-modes/classic-mode.service';
import { TimeAttackModeService } from './game-modes/time-attack-mode.service';
import { EndlessModeService } from './game-modes/endless-mode.service';
import { BattleRoyaleModeService } from './game-modes/battle-royale-mode.service';
import { ClassicScoringStrategy } from './strategies/scoring/classic-scoring.strategy';
import { TimeAttackScoringStrategy } from './strategies/scoring/time-attack-scoring.strategy';
import { EndlessScoringStrategy } from './strategies/scoring/endless-scoring.strategy';
import { BattleRoyaleScoringStrategy } from './strategies/scoring/battle-royale-scoring.strategy';
import { GameModeService } from './game-mode.service';
import { CustomGameModeService } from './custom-game-mode.service';
import { MatchmakingService } from './matchmaking.service';
import { GameStatsService } from './game-stats.service';
import { GameModeController } from './game-mode.controller';
import { GameGateway } from './game.gateway';
import { CustomGameMode } from './entities/custom-game-mode.entity';
import { GameSessionModule } from '../game-session/game-session.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([CustomGameMode]), GameSessionModule, AuthModule],
  providers: [
    // Scoring strategies
    ClassicScoringStrategy,
    TimeAttackScoringStrategy,
    EndlessScoringStrategy,
    BattleRoyaleScoringStrategy,

    // Game modes
    ClassicModeService,
    TimeAttackModeService,
    EndlessModeService,
    BattleRoyaleModeService,

    // Services
    GameModeService,
    CustomGameModeService,
    MatchmakingService,
    GameStatsService,

    // `/game` websocket namespace
    GameGateway,
  ],
  controllers: [GameModeController],
  exports: [GameModeService, MatchmakingService, GameStatsService],
})
export class GameModule {}
