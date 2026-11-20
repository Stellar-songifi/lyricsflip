import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';

/** Calls the Soroban/Stellar RPC `getHealth` JSON-RPC method. */
@Injectable()
export class StellarRpcHealthIndicator extends HealthIndicator {
  constructor(private readonly config: ConfigService) {
    super();
  }

  private resolveRpcUrl(): string | undefined {
    return (
      this.config.get<string>('soroban.rpcUrl') ??
      process.env.SOROBAN_RPC_URL ??
      process.env.STELLAR_RPC_URL
    );
  }

  async isHealthy(key: string, timeoutMs = 3000): Promise<HealthIndicatorResult> {
    const url = this.resolveRpcUrl();

    if (!url) {
      return this.getStatus(key, true, { message: 'RPC URL not configured' });
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = (await res.json()) as { result?: { status?: string } };
      const status = body.result?.status;
      if (!res.ok || status !== 'healthy') {
        throw new Error(`RPC status: ${status ?? res.status}`);
      }
      return this.getStatus(key, true, { status });
    } catch (err) {
      throw new HealthCheckError(
        'Stellar RPC getHealth failed',
        this.getStatus(key, false, { message: (err as Error).message }),
      );
    }
  }

  /**
   * Calls the Soroban/Stellar RPC `getLatestLedger` JSON-RPC method and
   * returns the latest ledger sequence number.
   */
  async getLatestLedger(timeoutMs = 3000): Promise<number> {
    const url = this.resolveRpcUrl();

    if (!url) {
      throw new Error('RPC URL not configured');
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger' }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const body = (await res.json()) as {
      result?: { sequence?: number };
      error?: { message?: string };
    };

    if (!res.ok || body.error || typeof body.result?.sequence !== 'number') {
      throw new Error(
        `RPC getLatestLedger failed: ${
          body.error?.message ?? `status ${res.status}`
        }`,
      );
    }

    return body.result.sequence;
  }

  /** Terminus indicator that verifies `getLatestLedger` succeeds within the timeout. */
  async isLatestLedgerHealthy(
    key: string,
    timeoutMs = 3000,
  ): Promise<HealthIndicatorResult> {
    try {
      const sequence = await this.getLatestLedger(timeoutMs);
      return this.getStatus(key, true, { latestLedger: sequence });
    } catch (err) {
      throw new HealthCheckError(
        'Stellar RPC getLatestLedger failed',
        this.getStatus(key, false, { message: (err as Error).message }),
      );
    }
  }
}
