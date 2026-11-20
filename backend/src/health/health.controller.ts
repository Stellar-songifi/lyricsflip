import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';
import { RedisHealthIndicator } from './redis.health';
import {
  IndexerLagHealthIndicator,
  StellarRpcHealthIndicator,
} from './stellar-rpc.health';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly stellarRpc: StellarRpcHealthIndicator,
    private readonly indexerLag: IndexerLagHealthIndicator,
  ) {}

  /** Liveness probe: process-only, always 200 while the app is running. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness probe: 200 with per-dependency status, or 503 when any dependency is down. */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
      () => this.redis.isHealthy('redis'),
      () => this.stellarRpc.isHealthy('stellarRpc'),
      () => this.stellarRpc.isLatestLedgerHealthy('indexer'),
      () => this.indexerLag.isHealthy('indexerLag'),
    ]);
  }

  /** Backwards-compatible alias for readiness. */
  @Get()
  @HealthCheck()
  check() {
    return this.ready();
  }
}
