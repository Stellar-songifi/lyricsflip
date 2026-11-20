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
import { AuthModule } from './auth/auth.module';
import { SongsModule } from './songs/songs.module';
import { ScoringModule } from './scoring/scoring.module';
import { QuestionsModule } from './questions/questions.module';
import { QuickGameModule } from './quick-game/quick-game.module';
import { GameModule } from './game/game.module';
import { AchievementModule } from './achievement/achievement.module';
import { RoomModule } from './room/room.module';
import { SocialModule } from './social/social.module';
import { PaginationModule } from './common/pagination/pagination.module';
import { IndexerModule } from './indexer/indexer.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { GameSessionModule } from './game-session/game-session.module';
import { WagerModule } from './wager/wager.module';
import { RewardModule } from './reward/reward.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { NotificationModule } from './notification/notification.module';
import { LoggerModule } from './logger/logger.module';
import { UserModule } from './user/user.module';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { DEFAULT_THROTTLE } from './common/throttler/throttle-limits';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL') ?? process.env.DATABASE_URL,
        autoLoadEntities: true,
        synchronize: false,
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsRun: process.env.DB_MIGRATIONS_RUN !== 'false',
      }),
    }),
    RedisModule,
    AuthModule,
    UserModule,
    GameSessionModule,
    WagerModule,
    RewardModule,
    LeaderboardModule,
    NotificationModule,
    LoggerModule,
    GameModule,
    PaginationModule,
    EventEmitterModule.forRoot(),
    // Global limit for general reads; /auth/* and answer submission apply
    // stricter per-route limits (see common/throttler/throttle-limits.ts).
    // Redis-backed storage keeps counts consistent across instances. Window
    // and limit come from configuration.ts (RATE_LIMIT_TTL/RATE_LIMIT_LIMIT),
    // falling back to DEFAULT_THROTTLE's values when unset.
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
    QuestionsModule,
    QuickGameModule,
    // cache-manager-redis-yet targets the cache-manager v5 API (unlike
    // cache-manager-redis-store@3, which silently fails on v5). The Redis
    // connection is described by the single `redis.url` setting, shared with
    // the throttler storage above.
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
    SongsModule,
    AnalyticsModule,
    ScoringModule,
    AchievementModule,
    SocialModule,
    RoomModule,
    IndexerModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
