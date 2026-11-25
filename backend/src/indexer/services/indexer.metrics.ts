import { Injectable } from '@nestjs/common';
import { IndexerService } from './indexer.service';

/**
 * Thin façade that exposes indexer metrics to consumers outside the indexer
 * module (e.g. the health indicator). Keeps IndexerService as the single
 * source of truth while giving other modules a stable, narrow import.
 */
@Injectable()
export class IndexerMetrics {
  constructor(private readonly indexer: IndexerService) {}

  getMetrics() {
    return this.indexer.getMetrics();
  }
}
