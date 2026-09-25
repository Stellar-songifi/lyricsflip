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
import { ConfigModule } from './config/config.module';
import { GlobalInterceptor } from './interceptors/global.interceptor';
import { LoggerModule } from './logger/logger.module';
import { RequestLoggerMiddleware } from './logger/request-logger.middleware';
import { SongsModule } from './songs/songs.module';
import { ScoringModule } from './scoring/scoring.module';
import { ChatRoomModule } from './chat-room/chat-room.module';
import { QuestionsModule } from './questions/questions.module';
import { QuickGameModule } from './quick-game/quick-game.module';
import { PowerUpModule } from './power-ups/power-up.module';
import { TournamentService } from './tournament/tournament.service';
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

@Module({
  imports: [
    AuthModule,
    UserModule,
    GameSessionModule,
    WagerModule,
    RewardModule,
    LeaderboardModule,
    NotificationModule,
    AdminModule,
    PlayerModule,
    LoggerModule,
    ConfigModule,
    GameModule,
    PaginationModule,
    EventEmitterModule.forRoot(),
    // Global limit for general reads; /auth/* and answer submission apply
    // stricter per-route limits (see common/throttler/throttle-limits.ts).
    // Redis-backed storage keeps counts consistent across instances.
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ name: 'default', ...DEFAULT_THROTTLE }],
        storage: new RedisThrottlerStorage(
          new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'),
        ),
      }),
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize:
        process.env.DB_SYNCHRONIZE !== undefined
          ? process.env.DB_SYNCHRONIZE === 'true'
          : process.env.NODE_ENV === 'development',
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      migrationsRun: process.env.DB_MIGRATIONS_RUN !== 'false',
    }),
    QuestionsModule,
    QuickGameModule,
    CacheModule.register({
      store: redisStore,
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
      ttl: 3600,
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
    TournamentService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
