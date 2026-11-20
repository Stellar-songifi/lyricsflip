// src/replay-analysis/replay-analysis.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Replay } from './entities/replay.entity';

@Injectable()
export class ReplayAnalysisService {
  private readonly logger = new Logger(ReplayAnalysisService.name);

  constructor(
    @InjectRepository(Replay)
    private replayRepository: Repository<Replay>,
    private replayStorageService: ReplayStorageService,
    private patternRecognitionService: PatternRecognitionService,
    private anomalyDetectionService: AnomalyDetectionService,
    private reportingService: ReportingService,
    private visualizationService: VisualizationService,
  ) {}

  async uploadAndAnalyzeReplay(
    file: Buffer,
    filename: string,
    gameId: string,
    matchId: string,
    playerIds: string[],
    gameVersion: string,
    mapId?: string,
    gameMode?: string,
    durationSeconds?: number,
  ): Promise<any> {
    try {
      // 1. Create replay record
      const replay = this.replayRepository.create({
        gameId,
        matchId,
        playerIds,
        gameVersion,
        mapId,
        gameMode,
        durationSeconds: durationSeconds || 0,
        hasBeenAnalyzed: false,
      });
      
      const savedReplay = await this.replayRepository.save(replay);
      
      // 2. Store replay file
      const storageUrl = await this.replayStorageService.storeReplay(
        savedReplay.id,
        file,
        filename,
      );
      
      // Update replay with storage URL
      savedReplay.storageUrl = storageUrl;
      await this.replayRepository.save(savedReplay);
      
      // 3. Parse replay data (mock implementation)
      const replayData = this.parseReplayFile(file);
      
      // 4. Analyze patterns for each player
      const allPatterns = [];
      for (const playerId of playerIds) {
        const playerPatterns = await this.patternRecognitionService.analyzeReplay(
          replayData,
          playerId,
          savedReplay.id,
        );
        allPatterns.push(...playerPatterns);
      }
      
      // 5. Detect anomalies for each player
      const allAnomalies = [];
      for (const playerId of playerIds) {
        const playerPatterns = allPatterns.filter(p => p.playerId === playerId);
        const playerAnomalies = await this.anomalyDetectionService.detectAnomalies(
          replayData,
          playerPatterns,
          playerId,
          savedReplay.id,
        );
        allAnomalies.push(...playerAnomalies);
      }
      
      // 6. Generate reports for critical anomalies
      const criticalAnomalies = allAnomalies.filter(
        a => a.severity === AnomalySeverity.CRITICAL
      );
      
      for (const playerId of playerIds) {
        const playerCriticalAnomalies = criticalAnomalies.filter(a => a.playerId === playerId);
        
        if (playerCriticalAnomalies.length > 0) {
          await this.reportingService.createReport(
            savedReplay.id,
            playerId,
            playerCriticalAnomalies.map(a => a.id),
            'Critical anomalies detected',
            `Automated report: ${playerCriticalAnomalies.length} critical anomalies detected`,
            true, // Auto-generated
          );
        }
      }
      
      // 7. Mark replay as analyzed
      savedReplay.hasBeenAnalyzed = true;
      savedReplay.analyzedAt = new Date();
      await this.replayRepository.save(savedReplay);
      
      // Return analysis results
      return {
        replayId: savedReplay.id,
        patterns: allPatterns.length,
        anomalies: allAnomalies.length,
        criticalAnomalies: criticalAnomalies.length,
        analyzedAt: savedReplay.analyzedAt,
      };
    } catch (error) {
      this.logger.error(`Error processing replay: ${error.message}`);
      throw error;
    }
  }

  async getAnalysisVisualization(replayId: string): Promise<any> {
    try {
      const replay = await this.replayRepository.findOne(replayId);
      
      if (!replay) {
        throw new Error(`Replay with ID ${replayId} not found`);
      }
      
      // Get anomalies for the replay
      const anomalies = await this.anomalyDetectionService['anomalyRepository'].find({
        where: { replayId },
      });
      
      // Generate visualizations
      const visualizations = [];
      
      // Timeline of anomalies
      const timeline = await this.visualizationService.generateTimelineVisualization(
        replayId,
        anomalies,
      );
      visualizations.push(timeline);
      
      // Player heatmaps
      for (const playerId of replay.playerIds) {
        const heatmap = await this.visualizationService.generatePlayerHeatmap(
          replayId,
          playerId,
        );
        visualizations.push(heatmap);
        
        // Aim analysis for each player
        const aimAnalysis = await this.visualizationService.generateAimAnalysisVisualization(
          replayId,
          playerId,
        );
        visualizations.push(aimAnalysis);
      }
      
      return {
        replayId,
        visualizations,
      };
    } catch (error) {
      this.logger.error(`Error generating visualizations: ${error.message}`);
      throw error;
    }
  }

  private parseReplayFile(file: Buffer): any {
    // In a real implementation, this would parse the replay file format
    // For this example, we'll return mock data
    return {
      gameId: 'game_123',
      timestamp: new Date(),
      players: [
        {
          id: 'player_1',
          positions: [/* array of positions */],
          actions: [/* array of actions */],
          stats: {
            kills: 12,
            deaths: 5,
            accuracy: 0.75,
          },
        },
        // More players...
      ],
      maxSpeed: 60, // For anomaly detection
      minReactionTime: 0.05, // For anomaly detection
    };
  }
}