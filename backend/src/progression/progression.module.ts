// src/progression/progression.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgressionController } from './controllers/progression.controller';
import { ProgressionService } from './services/progression.service';
import { PlayerStats } from './entities/player-stats.entity';
import { PlayerLevel } from './entities/player-level.entity';
import { PlayerSkill } from './entities/player-skill.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlayerStats, PlayerLevel, PlayerSkill]),
  ],
  controllers: [ProgressionController],
  providers: [ProgressionService],
  exports: [ProgressionService],
})
export class ProgressionModule {}