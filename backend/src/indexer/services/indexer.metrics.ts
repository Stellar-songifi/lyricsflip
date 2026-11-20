import { Injectable } from '@nestjs/common';
import { IndexerService } from './indexer.service';

/**
 * Thin wrapper that exposes IndexerService metrics as a named provider so
 * IndexerModule can export it without exposing the full IndexerService API.
 */
@Injectable()
export class IndexerMetrics {
  constructor(private readonly indexerService: IndexerService) {}

  getMetrics() {
    return this.indexerService.getMetrics();
  }
}
