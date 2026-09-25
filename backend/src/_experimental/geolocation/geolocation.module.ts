// src/geolocation/geolocation.module.ts
import { Module, CacheModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GeolocationService } from './services/geolocation.service';
import { GeolocationController } from './controllers/geolocation.controller';
import { LocationEntity } from './entities/location.entity';
import { LocationAccessEntity } from './entities/location-access.entity';
import { RegionRestrictionsService } from './services/region-restrictions.service';
import { LocationAnalyticsService } from './services/location-analytics.service';
import { LocationReportingService } from './services/location-reporting.service';
import * as redisStore from 'cache-manager-redis-store';

@Module({
  imports: [
    TypeOrmModule.forFeature([LocationEntity, LocationAccessEntity]),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get('REDIS_HOST', 'localhost'),
        port: configService.get('REDIS_PORT', 6379),
        ttl: configService.get('GEOLOCATION_CACHE_TTL', 86400), // 24 hours
        max: 10000, // Maximum number of items in cache
      }),
    }),
  ],
  controllers: [GeolocationController],
  providers: [
    GeolocationService,
    RegionRestrictionsService,
    LocationAnalyticsService,
    LocationReportingService,
  ],
  exports: [
    GeolocationService,
    RegionRestrictionsService,
    LocationAnalyticsService,
    LocationReportingService,
  ],
})
export class GeolocationModule {}
