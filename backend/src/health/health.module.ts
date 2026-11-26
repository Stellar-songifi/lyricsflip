import { forwardRef, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { IndexerModule } from '../indexer/indexer.module';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';
import { StellarRpcHealthIndicator } from './stellar-rpc.health';
import { IndexerLagHealthIndicator } from './indexer-lag.health';

@Module({
  imports: [TerminusModule, forwardRef(() => IndexerModule)],
  controllers: [HealthController],
  providers: [
    RedisHealthIndicator,
    StellarRpcHealthIndicator,
    IndexerLagHealthIndicator,
  ],
})
export class HealthModule {}
