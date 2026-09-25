// src/sync/strategies/three-way-merge.strategy.ts
import { Injectable, Logger } from '@nestjs/common';
import { SyncStrategy } from '../interfaces/sync-strategy.interface';
import { Mergeable } from '../interfaces/mergeable.interface';

@Injectable()
export class ThreeWayMergeStrategy implements SyncStrategy {
  private readonly logger = new Logger(ThreeWayMergeStrategy.name);
  
  resolve<T extends Mergeable<T>>(local: T, remote: T, base?: T): T {
    if (!base) {
      this.logger.warn('No base version provided for three-way merge, falling back to simple merge');
      return local.merge(remote);
    }
    
    // Perform a three-way merge using the base as the common ancestor
    const result = local.merge(remote, base);
    
    // Increment version
    const newVersion = Math.max(local.getVersion(), remote.getVersion()) + 1;
    result.setVersion(newVersion);
    
    return result;
  }
  
  getName(): string {
    return 'three-way-merge';
  }
}