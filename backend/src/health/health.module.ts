import { forwardRef, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { IndexerModule } from '../indexer/indexer.module';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';
import {
  IndexerLagHealthIndicator,
  StellarRpcHealthIndicator,
} from './stellar-rpc.health';

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
