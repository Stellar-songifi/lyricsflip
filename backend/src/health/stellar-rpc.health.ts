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

  async isHealthy(key: string, timeoutMs = 3000): Promise<HealthIndicatorResult> {
    const url =
      this.config.get<string>('soroban.rpcUrl') ??
      process.env.SOROBAN_RPC_URL ??
      process.env.STELLAR_RPC_URL;

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
}
