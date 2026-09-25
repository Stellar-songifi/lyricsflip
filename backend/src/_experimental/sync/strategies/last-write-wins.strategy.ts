// src/sync/strategies/last-write-wins.strategy.ts
import { Injectable } from '@nestjs/common';
import { SyncStrategy } from '../interfaces/sync-strategy.interface';
import { Mergeable } from '../interfaces/mergeable.interface';

@Injectable()
export class LastWriteWinsStrategy implements SyncStrategy {
  resolve<T extends Mergeable<T>>(local: T, remote: T): T {
    // Simple strategy: whoever has the most recent update wins
    const localLastSynced = local.getLastSyncedAt() || new Date(0);
    const remoteLastSynced = remote.getLastSyncedAt() || new Date(0);
    
    if (remoteLastSynced > localLastSynced) {
      // Remote is newer, use it
      const newVersion = Math.max(local.getVersion(), remote.getVersion()) + 1;
      remote.setVersion(newVersion);
      return remote;
    } else {
      // Local is newer or same age, keep it
      const newVersion = Math.max(local.getVersion(), remote.getVersion()) + 1;
      local.setVersion(newVersion);
      return local;
    }
  }
  
  getName(): string {
    return 'last-write-wins';
  }
}
