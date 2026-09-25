// src/sync/sync.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncRecord } from './entities/sync-record.entity';
import { SyncHistory } from './entities/sync-history.entity';
import { LastWriteWinsStrategy } from './strategies/last-write-wins.strategy';
import { ThreeWayMergeStrategy } from './strategies/three-way-merge.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([SyncRecord, SyncHistory]),
  ],
  controllers: [SyncController],
  providers: [
    SyncService,
    LastWriteWinsStrategy,
    ThreeWayMergeStrategy,
  ],
  exports: [SyncService],
})
export class SyncModule {}