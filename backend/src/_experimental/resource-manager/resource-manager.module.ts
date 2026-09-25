import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Entities
import { ResourceUsage } from './entities/resource-usage.entity';
import { ScalingRule } from './entities/scaling-rule.entity';
import { ScalingEvent } from './entities/scaling-event.entity';
import { AlertConfig } from './entities/alert-config.entity';

// Services
import { ResourceManagerService } from './resource-manager.service';
import { LoadMonitorService } from './load-monitor.service';
import { ScalingManagerService } from './scaling-manager.service';
import { AlertService } from './alert.service';
import { CostOptimizerService } from './cost-optimizer.service';

// Providers
import { AwsProviderService } from './providers/aws-provider.service';
import { KubernetesProviderService } from './providers/kubernetes-provider.service';

// Strategies
import { ThresholdScalingStrategy } from './strategies/threshold-scaling.strategy';
import { PredictiveScalingStrategy } from './strategies/predictive-scaling.strategy';

// Controller and Gateway
import { ResourceManagerController } from './resource-manager.controller';
import { ResourceManagerGateway } from './resource-manager.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ResourceUsage,
      ScalingRule,
      ScalingEvent,
      AlertConfig,
    ]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    ConfigModule,
  ],
  controllers: [ResourceManagerController],
  providers: [
    ResourceManagerService,
    LoadMonitorService,
    ScalingManagerService,
    AlertService,
    CostOptimizerService,
    ThresholdScalingStrategy,
    PredictiveScalingStrategy,
    ResourceManagerGateway,
    {
      provide: 'CloudProvider',
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>('CLOUD_PROVIDER', 'aws');
        if (provider === 'kubernetes') {
          return new KubernetesProviderService(configService);
        }
        return new AwsProviderService(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: [ResourceManagerService],
})
export class ResourceManagerModule {}

// ----------------------------------------
// DOCUMENTATION FOR SUB-ISSUES
// ----------------------------------------

/*
Sub-Issues for Resource Manager Implementation:

1. Load Monitoring Implementation
   - Description: Set up continuous monitoring of server resources and player load
   - Tasks:
     * Implement metrics collection from cloud providers
     * Set up time-series storage for historical analysis
     * Create monitoring dashboard endpoints
     * Implement resource health status detection

2. Advanced Scaling Rules
   - Description: Develop more sophisticated scaling algorithms based on game patterns
   - Tasks:
     * Research game-specific load patterns
     * Create machine learning model for predicting player counts
     * Implement time-based scaling for events
     * Integrate with game event calendar

3. Multi-Provider Support
   - Description: Extend resource management to work with different cloud providers
   - Tasks:
     * Abstract cloud provider interfaces
     * Implement GCP/Azure support
     * Add hybrid-cloud capabilities
     * Create migration tooling between providers

4. Cost Analysis Dashboard
   - Description: Build a comprehensive cost analysis and optimization tool
   - Tasks:
     * Implement detailed cost breakdowns by service
     * Create cost forecasting tools
     * Add budget alert mechanisms
     * Build cost optimization recommendations

5. Performance Benchmark Framework
   - Description: Create automated testing to measure resource efficiency
   - Tasks:
     * Build synthetic load generation
     * Create performance metrics baseline
     * Implement A/B testing for scaling strategies
     * Develop performance regression analysis
*/
