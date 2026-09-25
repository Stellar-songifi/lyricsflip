import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { GameState } from '../entities/game-state.entity';
import { StateAudit } from '../entities/state-audit.entity';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class StateRecoveryService {
  constructor(
    @InjectRepository(GameState)
    private gameStateRepository: Repository<GameState>,
    @InjectRepository(StateAudit)
    private auditRepository: Repository<StateAudit>,
    private readonly redisService: RedisService,
    private readonly logger: Logger
  ) {}

  async createSnapshot(
    gameId: string,
    playerId: string,
    state: any
  ): Promise<GameState> {
    // Calculate checksum for validation
    const checksum = this.calculateChecksum(state);

    // Get current version
    const currentVersion = await this.getCurrentVersion(gameId);

    const snapshot = this.gameStateRepository.create({
      gameId,
      playerId,
      state,
      version: currentVersion + 1,
      checksum
    });

    // Store in Redis for quick access
    await this.redisService.set(
      `game:${gameId}:state`,
      JSON.stringify(snapshot),
      3600
    );

    // Store in database for persistence
    await this.gameStateRepository.save(snapshot);

    await this.createAuditLog(
      snapshot,
      'SNAPSHOT_CREATED',
      null,
      state,
      playerId
    );

    return snapshot;
  }

  async recoverState(gameId: string): Promise<GameState> {
    // Try to get from Redis first
    const cachedState = await this.redisService.get(`game:${gameId}:state`);
    if (cachedState) {
      return JSON.parse(cachedState);
    }

    // Fallback to database
    const latestState = await this.gameStateRepository.findOne({
      where: { gameId, isValid: true },
      order: { version: 'DESC' }
    });

    if (!latestState) {
      throw new NotFoundException('No recoverable state found');
    }

    // Validate state before returning
    if (!this.validateState(latestState)) {
      // Try to recover from previous version
      return this.rollbackToVersion(gameId, latestState.version - 1);
    }

    return latestState;
  }

  async rollbackToVersion(
    gameId: string,
    version: number
  ): Promise<GameState> {
    const targetState = await this.gameStateRepository.findOne({
      where: { gameId, version, isValid: true }
    });

    if (!targetState) {
      throw new NotFoundException('Target version not found');
    }

    // Mark current version as invalid
    await this.gameStateRepository.update(
      { gameId, version: MoreThan(version) },
      { isValid: false }
    );

    // Create audit log
    await this.createAuditLog(
      targetState,
      'ROLLBACK',
      null,
      targetState.state,
      'SYSTEM'
    );

    // Update Redis cache
    await this.redisService.set(
      `game:${gameId}:state`,
      JSON.stringify(targetState),
      3600
    );

    return targetState;
  }

  private async createAuditLog(
    gameState: GameState,
    action: string,
    previousState: any,
    newState: any,
    triggeredBy: string
  ): Promise<void> {
    const audit = this.auditRepository.create({
      gameState,
      action,
      previousState,
      newState,
      triggeredBy
    });

    await this.auditRepository.save(audit);
    this.logger.log(
      `State audit created: ${action} for game ${gameState.gameId}`
    );
  }

  private validateState(state: GameState): boolean {
    // Implement validation logic
    const calculatedChecksum = this.calculateChecksum(state.state);
    return calculatedChecksum === state.checksum;
  }

  private calculateChecksum(state: any): string {
    // Implement checksum calculation
    return createHash('sha256')
      .update(JSON.stringify(state))
      .digest('hex');
  }

  private async getCurrentVersion(gameId: string): Promise<number> {
    const currentState = await this.gameStateRepository.findOne({
      where: { gameId },
      order: { version: 'DESC' }
    });

    return currentState ? currentState.version : 0;
  }
}
