import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayerFlag } from './entities/player-flag.entity';
import { AntiCheatService } from './providers/anti-cheat.service';
import { ModerationService } from './providers/moderation.service';
import { AntiCheatController } from './anti-cheat.controller';
import { IndexerModule } from '../indexer/indexer.module';
import { AuthModule } from '../auth/auth.module';

/**
 * AntiCheatModule bundles:
 *   – PlayerFlag entity (player_flags table)
 *   – AntiCheatService  (heuristic evaluation, event-driven)
 *   – ModerationService (admin queue read/write)
 *   – AntiCheatController (admin REST endpoints at /admin/anti-cheat/*)
 *
 * Imports IndexerModule (via forwardRef to avoid cycles with LeaderboardModule)
 * to access the ChainAnswer, ChainRound, and ChainRoundResult repositories.
 *
 * ModerationService is exported so LeaderboardModule can inject it to
 * annotate and suppress flagged entries on the public leaderboard.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PlayerFlag]),
    forwardRef(() => IndexerModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [AntiCheatController],
  providers: [AntiCheatService, ModerationService],
  exports: [ModerationService, AntiCheatService],
})
export class AntiCheatModule {}
