import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { Redis } from 'ioredis';

@Injectable()
export class RedisHealthIndicator
  extends HealthIndicator
  implements OnModuleDestroy
{
  private readonly client = new Redis(
    process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false },
  );

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      if (this.client.status === 'wait' || this.client.status === 'end') {
        await this.client.connect();
      }
      const pong = await this.client.ping();
      return this.getStatus(key, pong === 'PONG');
    } catch (err) {
      throw new HealthCheckError(
        'Redis ping failed',
        this.getStatus(key, false, { message: (err as Error).message }),
      );
    }
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
