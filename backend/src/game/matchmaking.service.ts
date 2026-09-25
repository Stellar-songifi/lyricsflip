// src/game/matchmaking.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { GameModeService } from './game-mode.service';

interface QueuedPlayer {
  id: string;
  preferredMode: string;
  queueTime: Date;
  skill: number;
}

@Injectable()
export class MatchmakingService implements OnModuleDestroy {
  private readonly logger = new Logger(MatchmakingService.name);
  private playerQueue: QueuedPlayer[] = [];
  private matchmakingInterval: NodeJS.Timeout;

  constructor(private readonly gameModeService: GameModeService) {
    // Run matchmaking process every 5 seconds
    this.matchmakingInterval = setInterval(() => this.processMatchmaking(), 5000);
  }

  onModuleDestroy() {
    clearInterval(this.matchmakingInterval);
  }

  private startMatch(modeId: string, playerIds: string[]): void {
    this.gameModeService
      .startSession(modeId, playerIds)
      .catch((error) => this.logger.error(`Failed to start ${modeId} match: ${error.message}`));
  }

  queuePlayer(playerId: string, preferredMode: string, skill: number): void {
    // Check if player is already in queue
    const existingIndex = this.playerQueue.findIndex(p => p.id === playerId);
    if (existingIndex >= 0) {
      this.playerQueue.splice(existingIndex, 1);
    }

    // Add player to queue
    this.playerQueue.push({
      id: playerId,
      preferredMode,
      queueTime: new Date(),
      skill,
    });
  }

  dequeuePlayer(playerId: string): boolean {
    const initialLength = this.playerQueue.length;
    this.playerQueue = this.playerQueue.filter(p => p.id !== playerId);
    return this.playerQueue.length < initialLength;
  }

  getQueueStatus(playerId: string): { position: number; estimatedWaitTime: number } | null {
    const playerIndex = this.playerQueue.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      return null;
    }

    // Simple estimation based on queue position
    const estimatedWaitTime = playerIndex * 10; // 10 seconds per player ahead
    
    return {
      position: playerIndex + 1,
      estimatedWaitTime,
    };
  }

  processMatchmaking(): void {
    // Process each game mode
    for (const mode of this.gameModeService.getAllModes()) {
      // Get players who prefer this mode
      const eligiblePlayers = this.playerQueue
        .filter(p => p.preferredMode === mode.id)
        .sort((a, b) => a.queueTime.getTime() - b.queueTime.getTime());

      // Skip if not enough players
      if (eligiblePlayers.length < mode.minPlayers) {
        continue;
      }

      // Create matches
      while (eligiblePlayers.length >= mode.minPlayers) {
        // Take required number of players
        const matchPlayers = eligiblePlayers.splice(0, mode.maxPlayers);
        const playerIds = matchPlayers.map(p => p.id);
        
        // Start a game session
        this.startMatch(mode.id, playerIds);
        
        // Remove these players from the queue
        this.playerQueue = this.playerQueue.filter(p => !playerIds.includes(p.id));
      }
    }

    // For players waiting too long, try to match them with any available mode
    const longWaitingPlayers = this.playerQueue
      .filter(p => (new Date().getTime() - p.queueTime.getTime()) > 60000) // Waiting > 1 minute
      .sort((a, b) => a.queueTime.getTime() - b.queueTime.getTime());

    if (longWaitingPlayers.length > 0) {
      // Find a suitable game mode with lowest player requirement
      const modes = this.gameModeService.getAllModes()
        .sort((a, b) => a.minPlayers - b.minPlayers);

      for (const mode of modes) {
        if (longWaitingPlayers.length >= mode.minPlayers) {
          // Take required number of players
          const matchPlayers = longWaitingPlayers.splice(0, mode.maxPlayers);
          const playerIds = matchPlayers.map(p => p.id);
          
          // Start a game session
          this.startMatch(mode.id, playerIds);
          
          // Remove these players from the queue
          this.playerQueue = this.playerQueue.filter(p => !playerIds.includes(p.id));
          break;
        }
      }
    }
  }
}