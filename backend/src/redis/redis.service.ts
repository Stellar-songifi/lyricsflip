import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService {
  private client: Redis;

  constructor() {
    this.client = new Redis({
      host: '127.0.0.1',
      port: 6379,
    });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.set(key, value, 'EX', ttl);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  // Deletes every key matching a glob pattern (e.g. 'leaderboard:*'). Uses
  // SCAN rather than KEYS so it doesn't block Redis on large keyspaces.
  async delPattern(pattern: string): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  // --- Sorted sets (leaderboards) -------------------------------------

  // Replaces the whole sorted set at `key` with `entries`. The new contents
  // are staged under a temporary key and swapped in with RENAME, so readers
  // never observe a half-built board. An empty `entries` deletes the key.
  async replaceSortedSet(
    key: string,
    entries: { member: string; score: number }[],
  ): Promise<void> {
    if (entries.length === 0) {
      await this.client.del(key);
      return;
    }
    const tmp = `${key}:tmp:${process.pid}:${Date.now()}`;
    try {
      const chunkSize = 1000;
      for (let i = 0; i < entries.length; i += chunkSize) {
        const args: (string | number)[] = [];
        for (const { member, score } of entries.slice(i, i + chunkSize)) {
          args.push(score, member);
        }
        await this.client.zadd(tmp, ...args);
      }
      await this.client.rename(tmp, key);
    } catch (error) {
      await this.client.del(tmp);
      throw error;
    }
  }

  // Sets (not increments) the score of each member, so repeating the call is
  // idempotent.
  async zaddMany(
    key: string,
    entries: { member: string; score: number }[],
  ): Promise<void> {
    if (entries.length === 0) return;
    const args: (string | number)[] = [];
    for (const { member, score } of entries) args.push(score, member);
    await this.client.zadd(key, ...args);
  }

  async zrem(key: string, members: string[]): Promise<void> {
    if (members.length === 0) return;
    await this.client.zrem(key, ...members);
  }

  // Highest score first; `start`/`stop` are zero-based inclusive indexes.
  async zrevrangeWithScores(
    key: string,
    start: number,
    stop: number,
  ): Promise<{ member: string; score: number }[]> {
    const flat = await this.client.zrevrange(key, start, stop, 'WITHSCORES');
    const out: { member: string; score: number }[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      out.push({ member: flat[i], score: Number(flat[i + 1]) });
    }
    return out;
  }

  // Zero-based rank, highest score first; null when the member is absent.
  async zrevrank(key: string, member: string): Promise<number | null> {
    return this.client.zrevrank(key, member);
  }

  async zscore(key: string, member: string): Promise<number | null> {
    const score = await this.client.zscore(key, member);
    return score === null ? null : Number(score);
  }

  async zcard(key: string): Promise<number> {
    return this.client.zcard(key);
  }

  // Atomically evaluates a Lua script against Redis. Used by the WebSocket
  // rate limiter to perform a token-bucket check-and-update in a single round
  // trip so it stays consistent across multiple backend instances.
  async eval(
    script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<unknown> {
    return this.client.eval(script, keys.length, ...keys, ...args);
  }

  // Increments a counter and sets its TTL on first creation. Returns the new
  // counter value. Useful for tracking consecutive violations.
  async incrWithTtl(key: string, ttl: number): Promise<number> {
    const value = await this.client.incr(key);
    if (value === 1) {
      await this.client.expire(key, ttl);
    }
    return value;
  }
}