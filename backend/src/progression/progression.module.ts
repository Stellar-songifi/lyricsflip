import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgressionController } from './controllers/progression.controller';
import { PlayerLevel } from './entities/player-level.entity';
import { PlayerSkill } from './entities/player-skill.entity';
import { PlayerStats } from './entities/player-stats.entity';
import { ProgressionService } from './services/progression.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlayerStats, PlayerLevel, PlayerSkill])],
  controllers: [ProgressionController],
  providers: [ProgressionService],
  exports: [ProgressionService],
})
export class ProgressionModule {}
