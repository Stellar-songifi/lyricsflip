// src/sync/interfaces/sync-strategy.interface.ts
import { Mergeable } from './mergeable.interface';

export interface SyncStrategy {
  /**
   * Resolves conflicts between local and remote versions
   * @param local Local version of the data
   * @param remote Remote version of the data 
   * @param base Common ancestor version (if available)
   * @returns Merged result
   */
  resolve<T extends Mergeable<T>>(local: T, remote: T, base?: T): T;
  
  /**
   * Name of the strategy
   */
  getName(): string;
}