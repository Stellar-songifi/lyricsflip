import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { IndexerService } from '../indexer/services/indexer.service';

/**
 * Reports whether the indexer has polled recently and without consecutive
 * errors. Used by the /health/ready endpoint.
 */
@Injectable()
export class IndexerHealthIndicator extends HealthIndicator {
  constructor(private readonly indexerService: IndexerService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const metrics = this.indexerService.getMetrics();
    const isHealthy = metrics.consecutiveErrors < 5;

    const result = this.getStatus(key, isHealthy, {
      consecutiveErrors: metrics.consecutiveErrors,
      lastPollAt: metrics.lastPollAt,
      errorCount: metrics.errorCount,
    });

    if (!isHealthy) {
      throw new HealthCheckError('Indexer is unhealthy', result);
    }

    return result;
  }
}
