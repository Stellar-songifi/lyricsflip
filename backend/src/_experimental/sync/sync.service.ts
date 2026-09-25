// src/sync/sync.service.ts
import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncRecord } from './entities/sync-record.entity';
import { SyncHistory } from './entities/sync-history.entity';
import { SyncRequestDto } from './dto/sync-request.dto';
import { SyncResponseDto } from './dto/sync-response.dto';
import { DeltaUpdateDto } from './dto/delta-update.dto';
import { Mergeable } from './interfaces/mergeable.interface';
import { SyncStrategy } from './interfaces/sync-strategy.interface';
import { LastWriteWinsStrategy } from './strategies/last-write-wins.strategy';
import { ThreeWayMergeStrategy } from './strategies/three-way-merge.strategy';
import * as jsonpatch from 'fast-json-patch';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly strategies: Map<string, SyncStrategy> = new Map();
  
  constructor(
    @InjectRepository(SyncRecord)
    private syncRecordRepository: Repository<SyncRecord>,
    @InjectRepository(SyncHistory)
    private syncHistoryRepository: Repository<SyncHistory>,
    private lastWriteWinsStrategy: LastWriteWinsStrategy,
    private threeWayMergeStrategy: ThreeWayMergeStrategy,
  ) {
    // Register available strategies
    this.registerStrategy(this.lastWriteWinsStrategy);
    this.registerStrategy(this.threeWayMergeStrategy);
  }
  
  private registerStrategy(strategy: SyncStrategy): void {
    this.strategies.set(strategy.getName(), strategy);
  }
  
  private getStrategy(name: string = 'three-way-merge'): SyncStrategy {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      this.logger.warn(`Strategy ${name} not found, falling back to three-way-merge`);
      return this.threeWayMergeStrategy;
    }
    return strategy;
  }
  
  async sync<T extends Mergeable<T>>(request: SyncRequestDto<T>): Promise<SyncResponseDto<T>> {
    try {
      // Find existing record for this user and data type
      let existingRecord = await this.syncRecordRepository.findOne({
        where: { 
          userId: request.userId,
          dataType: request.dataType
        },
        relations: ['history'],
      });
      
      // Get current timestamp
      const now = new Date();
      
      if (!existingRecord) {
        // First sync for this data type, just save it
        const record = this.syncRecordRepository.create({
          userId: request.userId,
          dataType: request.dataType,
          version: 1,
          data: request.data,
          lastSyncedAt: now,
        });
        
        const savedRecord = await this.syncRecordRepository.save(record);
        
        // Create history entry
        await this.createHistoryEntry(savedRecord, request.deviceInfo.deviceId);
        
        return {
          success: true,
          version: 1,
          data: request.data as any,
          hasConflicts: false,
          syncedAt: now,
        };
      }
      
      // Convert the existing data to a Mergeable if it isn't already
      const localData = request.data;
      localData.setLastSyncedAt(now);
      
      // Create remote data object from DB
      const remoteData = existingRecord.data as T;
      
      // Find base version if we have one and three-way merge is requested
      let baseData: T | undefined;
      
      if (request.baseVersion) {
        const baseHistory = await this.syncHistoryRepository.findOne({
          where: {
            syncRecordId: existingRecord.id,
            version: request.baseVersion,
          },
        });
        
        if (baseHistory) {
          baseData = baseHistory.data as T;
        }
      }
      
      // Detect if we need conflict resolution
      const hasConflict = remoteData.getVersion() !== request.version;
      
      let result: T;
      let strategyUsed = 'none';
      
      if (hasConflict) {
        // Need to resolve conflict
        const strategy = this.getStrategy();
        strategyUsed = strategy.getName();
        
        result = strategy.resolve(localData, remoteData, baseData);
      } else {
        // No conflict, just update with new data
        result = localData;
        result.setVersion(existingRecord.version + 1);
      }
      
      // Calculate delta if needed for the response
      const delta = remoteData.diff(result);
      
      // Update record
      existingRecord.version = result.getVersion();
      existingRecord.data = result;
      existingRecord.lastSyncedAt = now;
      await this.syncRecordRepository.save(existingRecord);
      
      // Create history entry
      await this.createHistoryEntry(
        existingRecord, 
        request.deviceInfo.deviceId, 
        strategyUsed,
        request.delta,
      );
      
      return {
        success: true,
        version: existingRecord.version,
        data: result as any,
        hasConflicts: hasConflict,
        conflictDetails: hasConflict ? {
          localVersion: request.version,
          remoteVersion: remoteData.getVersion(),
          resolvedWithStrategy: strategyUsed,
        } : undefined,
        syncedAt: now,
        strategyUsed: strategyUsed !== 'none' ? strategyUsed : undefined,
        delta,
      };
    } catch (error) {
      this.logger.error(`Error during sync: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  private async createHistoryEntry(
    record: SyncRecord,
    deviceId?: string,
    strategyUsed?: string,
    delta?: any,
  ): Promise<SyncHistory> {
    const history = this.syncHistoryRepository.create({
      syncRecordId: record.id,
      version: record.version,
      data: record.data,
      deviceId,
      strategyUsed,
      delta,
    });
    
    return this.syncHistoryRepository.save(history);
  }
  
  async applyDeltaUpdate<T>(deltaUpdate: DeltaUpdateDto<T>): Promise<SyncResponseDto<T>> {
    const existingRecord = await this.syncRecordRepository.findOne({
      where: { 
        userId: deltaUpdate.userId,
        dataType: deltaUpdate.dataType
      },
    });
    
    if (!existingRecord) {
      throw new NotFoundException(`No sync record found for user ${deltaUpdate.userId} and data type ${deltaUpdate.dataType}`);
    }
    
    if (existingRecord.version !== deltaUpdate.baseVersion) {
      throw new ConflictException(`Version mismatch: expected ${existingRecord.version}, got ${deltaUpdate.baseVersion}`);
    }
    
    // Apply delta to current data
    const currentData = existingRecord.data;
    const updatedData = { ...currentData, ...deltaUpdate.changes };
    
    // Update version
    existingRecord.version += 1;
    existingRecord.data = updatedData;
    existingRecord.lastSyncedAt = new Date();
    
    await this.syncRecordRepository.save(existingRecord);
    
    // Create history entry
    await this.createHistoryEntry(
      existingRecord,
      undefined,
      'delta-update',
      deltaUpdate.changes,
    );
    
    return {
      success: true,
      version: existingRecord.version,
      data: updatedData,
      hasConflicts: false,
      syncedAt: existingRecord.lastSyncedAt,
      delta: deltaUpdate.changes,
    };
  }
  
  async getSyncData(userId: string, dataType: string): Promise<SyncResponseDto<any>> {
    const existingRecord = await this.syncRecordRepository.findOne({
      where: { 
        userId,
        dataType,
      },
    });
    
    if (!existingRecord) {
      throw new NotFoundException(`No sync record found for user ${userId} and data type ${dataType}`);
    }
    
    return {
      success: true,
      version: existingRecord.version,
      data: existingRecord.data,
      hasConflicts: false,
      syncedAt: existingRecord.lastSyncedAt,
    };
  }
  
  async getSyncHistory(userId: string, dataType: string, limit = 10): Promise<SyncHistory[]> {
    const existingRecord = await this.syncRecordRepository.findOne({
      where: { 
        userId,
        dataType,
      },
    });
    
    if (!existingRecord) {
      throw new NotFoundException(`No sync record found for user ${userId} and data type ${dataType}`);
    }
    
    return this.syncHistoryRepository.find({
      where: { syncRecordId: existingRecord.id },
      order: { version: 'DESC' },
      take: limit,
    });
  }
  
  /**
   * Generate patches for offline support
   */
  async generatePatches(userId: string, dataType: string, fromVersion: number): Promise<any[]> {
    const record = await this.syncRecordRepository.findOne({
      where: { 
        userId,
        dataType,
      },
    });
    
    if (!record) {
      throw new NotFoundException(`No sync record found for user ${userId} and data type ${dataType}`);
    }
    
    // Get history entries from the specified version
    const history = await this.syncHistoryRepository.find({
      where: { 
        syncRecordId: record.id,
      },
      order: { version: 'ASC' },
    });
    
    // Filter history entries with version > fromVersion
    const relevantHistory = history.filter(h => h.version > fromVersion);
    
    if (relevantHistory.length === 0) {
      return [];
    }
    
    // Find the base version entry
    const baseEntry = history.find(h => h.version === fromVersion);
    
    if (!baseEntry) {
      // If we can't find the exact base version, return the entire current state
      return [{
        version: record.version,
        fullState: record.data,
        timestamp: record.updatedAt,
      }];
    }
    
    // Generate patches between versions
    const patches = [];
    
    for (let i = 0; i < relevantHistory.length; i++) {
      const entry = relevantHistory[i];
      
      // If we have a delta stored, use it
      if (entry.delta) {
        patches.push({
          version: entry.version,
          delta: entry.delta,
          timestamp: entry.createdAt,
        });
      } else {
        // Otherwise generate a JSON patch
        const prevEntry = i === 0 ? baseEntry : relevantHistory[i - 1];
        const patch = jsonpatch.compare(prevEntry.data, entry.data);
        
        patches.push({
          version: entry.version,
          jsonPatch: patch,
          timestamp: entry.createdAt,
        });
      }
    }
    
    return patches;
  }
}