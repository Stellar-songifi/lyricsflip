import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { IndexerService } from '../indexer/services/indexer.service';

/** Maximum acceptable ledger lag before the health check turns red. */
const MAX_LAG_LEDGERS = 100;

/**
 * Reports whether the indexer is keeping up with the chain tip.
 * A lag above MAX_LAG_LEDGERS ledgers is considered unhealthy.
 */
@Injectable()
export class IndexerLagHealthIndicator extends HealthIndicator {
  constructor(private readonly indexerService: IndexerService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const metrics = this.indexerService.getMetrics();
    const lag = metrics.lag ?? 0;
    const isHealthy = lag <= MAX_LAG_LEDGERS;

    const result = this.getStatus(key, isHealthy, {
      lag,
      lastLedger: metrics.lastLedger,
      latestLedger: metrics.latestLedger,
    });

    if (!isHealthy) {
      throw new HealthCheckError(
        `Indexer lag (${lag}) exceeds threshold (${MAX_LAG_LEDGERS})`,
        result,
      );
    }

    return result;
  }
}
