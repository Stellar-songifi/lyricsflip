import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { redisStore } from 'cache-manager-redis-yet';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PaginationModule } from './common/pagination/pagination.module';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { DEFAULT_THROTTLE } from './common/throttler/throttle-limits';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { LoggerModule } from './logger/logger.module';
import { RedisModule } from './redis/redis.module';
import {
  AdminModule,
  CatalogueModule,
  IdentityModule,
  RealtimeModule,
  RewardsModule,
  RoundsModule,
  SocialModule,
} from './domains';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppConfigModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false,
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      migrationsRun: process.env.DB_MIGRATIONS_RUN !== 'false',
    }),
    RedisModule,
    LoggerModule,
    PaginationModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get<number>('rateLimit.ttl') ?? DEFAULT_THROTTLE.ttl,
            limit:
              config.get<number>('rateLimit.limit') ?? DEFAULT_THROTTLE.limit,
          },
        ],
        storage: new RedisThrottlerStorage(
          new Redis(
            config.get<string>('redis.url') ?? 'redis://127.0.0.1:6379',
          ),
        ),
      }),
    }),
    CacheModule.registerAsync({
      inject: [ConfigService],
      isGlobal: true,
      useFactory: async (config: ConfigService) => ({
        store: await redisStore({
          url: config.get<string>('redis.url') ?? 'redis://127.0.0.1:6379',
          ttl: 3600,
        }),
      }),
    }),
    IdentityModule,
    CatalogueModule,
    RoundsModule,
    RealtimeModule,
    SocialModule,
    RewardsModule,
    AdminModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
