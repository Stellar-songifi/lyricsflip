import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { DataSource } from 'typeorm';
import { StellarRpcHealthIndicator } from './stellar-rpc.health';

/**
 * Compares the latest chain ledger (from the Soroban RPC) against the last
 * ledger persisted by the indexer and fails when the lag exceeds the
 * configured threshold.
 *
 * Config keys:
 *   indexer.maxLagLedgers   (env: INDEXER_MAX_LAG_LEDGERS, default 100)
 *   soroban.rpcTimeoutMs    (env: SOROBAN_RPC_TIMEOUT_MS, default 3000)
 */
@Injectable()
export class IndexerLagHealthIndicator extends HealthIndicator {
  constructor(
    private readonly config: ConfigService,
    private readonly rpc: StellarRpcHealthIndicator,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super();
  }

  private getThreshold(): number {
    const raw =
      this.config.get<number | string>('indexer.maxLagLedgers') ??
      this.config.get<number | string>('health.indexerMaxLagLedgers') ??
      process.env.INDEXER_MAX_LAG_LEDGERS ??
      100;
    const parsed = typeof raw === 'number' ? raw : parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 100;
  }

  private getRpcTimeout(): number {
    const raw =
      this.config.get<number | string>('soroban.rpcTimeoutMs') ??
      this.config.get<number | string>('health.rpcTimeoutMs') ??
      process.env.SOROBAN_RPC_TIMEOUT_MS ??
      3000;
    const parsed = typeof raw === 'number' ? raw : parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const threshold = this.getThreshold();

    try {
      const latestLedger = await this.rpc.getLatestLedger(this.getRpcTimeout());

      const rows = await this.dataSource.query(
        'SELECT MAX(last_ledger) AS last_ledger FROM indexer_state',
      );
      const lastLedgerRaw = rows?.[0]?.last_ledger;
      const lastLedger =
        lastLedgerRaw === null || lastLedgerRaw === undefined
          ? null
          : Number(lastLedgerRaw);

      if (lastLedger === null || !Number.isFinite(lastLedger)) {
        throw new Error('indexer_state.last_ledger not available');
      }

      const lag = latestLedger - lastLedger;
      const healthy = lag <= threshold;

      const status = this.getStatus(key, healthy, {
        latestLedger,
        lastLedger,
        lag,
        threshold,
      });

      if (!healthy) {
        throw new HealthCheckError('Indexer lag exceeds threshold', status);
      }

      return status;
    } catch (err) {
      if (err instanceof HealthCheckError) {
        throw err;
      }
      throw new HealthCheckError(
        'Indexer lag check failed',
        this.getStatus(key, false, { message: (err as Error).message }),
      );
    }
  }
}
