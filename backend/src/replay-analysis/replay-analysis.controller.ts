// src/replay-analysis/replay-analysis.controller.ts
import { Controller, Post, Get, Param, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('replay-analysis')
@Controller('replay-analysis')
export class ReplayAnalysisController {
  constructor(
    private replayAnalysisService: ReplayAnalysisService,
    private reportingService: ReportingService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadReplay(
    @UploadedFile() file,
    @Body() metadata: {
      gameId: string;
      matchId: string;
      playerIds: string;
      gameVersion: string;
      mapId?: string;
      gameMode?: string;
      durationSeconds?: number;
    },
  ) {
    // Parse playerIds from string to array
    const playerIds = metadata.playerIds.split(',');
    
    return this.replayAnalysisService.uploadAndAnalyzeReplay(
      file.buffer,
      file.originalname,
      metadata.gameId,
      metadata.matchId,
      playerIds,
      metadata.gameVersion,
      metadata.mapId,
      metadata.gameMode,
      metadata.durationSeconds ? parseInt(metadata.durationSeconds) : undefined,
    );
  }

  @Get(':replayId/analysis')
  async getAnalysis(@Param('replayId') replayId: string) {
    const replay = await this.replayAnalysisService['replayRepository'].findOne(replayId, {
      relations: ['patterns', 'anomalies'],
    });
    
    return {
      replayId,
      patterns: replay.patterns,
      anomalies: replay.anomalies,
      analyzedAt: replay.analyzedAt,
    };
  }

  @Get(':replayId/visualization')
  async getVisualization(@Param('replayId') replayId: string) {
    return this.replayAnalysisService.getAnalysisVisualization(replayId);
  }

  @Get(':replayId/reports')
  async getReports(@Param('replayId') replayId: string) {
    return this.reportingService.getReportsByReplay(replayId);
  }

  @Post('reports/:reportId/update')
  async updateReport(
    @Param('reportId') reportId: string,
    @Body() update: {
      status?: ReportStatus;
      actionTaken?: ReportActionTaken;
      notes?: string;
    },
  ) {
    return this.reportingService.updateReport(
      reportId,
      update.status,
      update.actionTaken,
      update.notes,
    );
  }
}
