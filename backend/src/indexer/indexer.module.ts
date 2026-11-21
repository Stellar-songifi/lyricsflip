import { forwardRef, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ChainAnswer,
  ChainNft,
  ChainRound,
  ChainRoundPlayer,
  ChainRoundResult,
  IndexerState,
  ProcessedEvent,
} from './entities/indexer-state.entity';
import { IndexerGateway } from './gateways/indexer.gateway';
import { IndexerService } from './services/indexer.service';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';

const chainEntities = [
  IndexerState,
  ChainRound,
  ChainRoundPlayer,
  ChainAnswer,
  ChainRoundResult,
  ChainNft,
  ProcessedEvent,
];

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forFeature(chainEntities),
    forwardRef(() => LeaderboardModule),
  ],
  providers: [IndexerService, IndexerGateway],
  exports: [IndexerService, TypeOrmModule],
})
export class IndexerModule {}
