// src/replay-analysis/replay-analysis.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Replay,
      Pattern,
      Anomaly,
      Report,
    ]),
  ],
  controllers: [
    ReplayAnalysisController,
  ],
  providers: [
    ReplayAnalysisService,
    ReplayStorageService,
    PatternRecognitionService,
    AnomalyDetectionService,
    ReportingService,
    VisualizationService,
  ],
  exports: [
    ReplayAnalysisService,
  ],
})
export class ReplayAnalysisModule {}