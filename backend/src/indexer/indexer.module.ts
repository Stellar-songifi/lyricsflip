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
// LF-340: the indexer derives Wager rows from the escrow contract's
// Deposited/Refunded/Settled/Claimed events via WagerService.
import { WagerModule } from '../wager/wager.module';

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
    // LF-340: makes WagerService available to IndexerService so escrow
    // events can upsert wager projections. WagerModule has no dependency on
    // IndexerModule, so this does not create a circular import.
    WagerModule,
  ],
  providers: [IndexerService, IndexerGateway],
  exports: [IndexerService, TypeOrmModule],
})
export class IndexerModule {}
