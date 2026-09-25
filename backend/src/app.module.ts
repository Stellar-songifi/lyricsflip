import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { GameSessionModule } from './game-session/game-session.module';
import { WagerModule } from './wager/wager.module';
import { RewardModule } from './reward/reward.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { NotificationModule } from './notification/notification.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AccessTokenGuard } from './auth/guard/access-token/access-token.guard';
import { CustomThrottlerGuard } from './auth/guard/throttler.guard';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppConfigModule } from './config/config.module';
import { GlobalInterceptor } from './interceptors/global.interceptor';
import { LoggerModule } from './logger/logger.module';
import { RequestLoggerMiddleware } from './logger/request-logger.middleware';
import { SongsModule } from './songs/songs.module';
import { ScoringModule } from './scoring/scoring.module';
import { ChatRoomModule } from './chat-room/chat-room.module';
import { QuestionsModule } from './questions/questions.module';
import { QuickGameModule } from './quick-game/quick-game.module';
import { PowerUpModule } from './power-ups/power-up.module';
import { TournamentModule } from './tournament/tournament.module';
import { GameModule } from './game/game.module';
import { AchievementModule } from './achievement/achievement.module';
import { MusicTheoryLessonModule } from './music-education/music-theory-lesson.module';
import { RoomModule } from './room/room.module';
import { SocialModule } from './social/social.module';
import { CacheModule } from '@nestjs/cache-manager';
import { EventEmitterModule } from '@nestjs/event-emitter';
import * as redisStore from 'cache-manager-redis-store';
import { ThrottlerModule } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { DEFAULT_THROTTLE } from './common/throttler/throttle-limits';
import { ReferralModule } from './referral/referral.module';
import { GameInsightsModule } from './game-insights/game-insights.module';
import { PaginationModule } from './common/pagination/pagination.module';
import { StateRecoveryModule } from './state-recovery/state-recovery.module';
import { IndexerModule } from './indexer/indexer.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Load AppConfigModule first so ConfigService is available for all
    // forRootAsync factories below.
    AppConfigModule,
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
          new Redis(config.get<string>('redis.url') ?? 'redis://127.0.0.1:6379'),
        ),
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('database.url'),
        autoLoadEntities: true,
        synchronize: config.get<boolean>('database.synchronize') ??
          config.get<string>('env') === 'development',
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsRun: config.get<boolean>('database.migrationsRun') !== false,
      }),
    }),
    QuestionsModule,
    QuickGameModule,
    CacheModule.registerAsync({
      inject: [ConfigService],
      isGlobal: true,
      useFactory: (config: ConfigService) => ({
        store: redisStore,
        socket: {
          host: config.get<string>('redis.host') ?? 'localhost',
          port: config.get<number>('redis.port') ?? 6379,
        },
        ttl: 3600,
      }),
    }),
    SongsModule,
    ChatRoomModule,
    ScoringModule,
    PowerUpModule,
    TournamentModule,
    AchievementModule,
    SocialModule,
    MusicTheoryLessonModule,
    RoomModule,
    ReferralModule,
    StateRecoveryModule,
    GameInsightsModule,
    IndexerModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: GlobalInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
