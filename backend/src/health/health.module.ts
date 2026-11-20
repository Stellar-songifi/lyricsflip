import { Module, forwardRef } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';
import { StellarRpcHealthIndicator } from './stellar-rpc.health';
import { IndexerHealthIndicator } from './indexer.health';
import { IndexerLagHealthIndicator } from './indexer-lag.health';
import { IndexerModule } from '../indexer/indexer.module';

@Module({
  imports: [
    TerminusModule,
    TypeOrmModule.forFeature([]),
    forwardRef(() => IndexerModule),
  ],
  controllers: [HealthController],
  providers: [
    RedisHealthIndicator,
    StellarRpcHealthIndicator,
    IndexerHealthIndicator,
    IndexerLagHealthIndicator,
  ],
})
export class HealthModule {}
