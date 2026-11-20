import { Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { IndexerMetrics } from '../indexer/services/indexer.metrics';

/**
 * Reports the indexer as healthy when it has polled at least once and has not
 * accumulated more than 5 consecutive RPC errors.
 *
 * This is a lightweight liveness check; lag relative to the chain tip is
 * covered separately by IndexerLagHealthIndicator.
 */
@Injectable()
export class IndexerHealthIndicator extends HealthIndicator {
  private static readonly MAX_CONSECUTIVE_ERRORS = 5;

  constructor(private readonly metrics: IndexerMetrics) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const m = this.metrics.getMetrics();

    const neverPolled = m.lastPollAt === null;
    const tooManyErrors =
      m.consecutiveErrors > IndexerHealthIndicator.MAX_CONSECUTIVE_ERRORS;

    const healthy = !neverPolled && !tooManyErrors;

    const details = {
      lastPollAt: m.lastPollAt?.toISOString() ?? null,
      consecutiveErrors: m.consecutiveErrors,
      lastErrorAt: m.lastErrorAt?.toISOString() ?? null,
    };

    if (!healthy) {
      throw new HealthCheckError(
        neverPolled ? 'Indexer has not polled yet' : 'Indexer error threshold exceeded',
        this.getStatus(key, false, details),
      );
    }

    return this.getStatus(key, true, details);
  }
}
