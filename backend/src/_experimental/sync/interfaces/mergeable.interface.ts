// src/sync/interfaces/mergeable.interface.ts
export interface Mergeable<T> {
    merge(other: T, base?: T): T;
    diff(other: T): Partial<T>;
    getVersion(): number;
    setVersion(version: number): void;
    getLastSyncedAt(): Date | null;
    setLastSyncedAt(date: Date): void;
  }