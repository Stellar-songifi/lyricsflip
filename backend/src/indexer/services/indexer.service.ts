import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { scValToNative } from '@stellar/stellar-sdk';
import { LeaderboardService } from '../../leaderboard/providers/leaderboard.service';
// LF-340: the indexer derives Wager rows from escrow contract events.
import { WagerService } from '../../wager/provider/wager.service';
import { WagerStatus } from '../../wager/entities/wager.entity';

/**
 * Metrics exposed by the indexer for the /health endpoint (LF-232).
 */
export interface IndexerMetrics {
  lastLedger: number | null;
  latestLedger: number | null;
  lag: number | null;
  errorCount: number;
  consecutiveErrors: number;
  lastErrorAt: Date | null;
  lastPollAt: Date | null;
  cursor: string | null;
}

/**
 * Domain event names emitted by the indexer. NotificationService listens for
 * these to persist and push notifications to users.
 */
export const IndexerDomainEvents = {
  ROUND_JOINED: 'round.joined',
  ROUND_STARTED: 'round.started',
  ROUND_COMPLETED: 'round.completed',
  REWARD_CLAIMABLE: 'reward.claimable',
  NFT_MINTED: 'nft.minted',
  ROUND_CANCELLED: 'round.cancelled',
} as const;

/**
 * LF-340: escrow contract event names (decoded from `topic[0]`). These are
 * the sole source of truth for wager records — the indexer derives all
 * Wager rows from them, never from client-reported data.
 */
export const EscrowEventNames = {
  DEPOSITED: 'deposited',
  REFUNDED: 'refunded',
  SETTLED: 'settled',
  CLAIMED: 'claimed',
  CANCELLED: 'cancelled',
  LOCKED: 'locked',
  SWEPT: 'swept',
} as const;

export interface RoundJoinedEvent {
  roundId: string;
  /** Admin/owner of the round who should be notified. */
  adminId: string;
  playerId: string;
  playerAddress?: string;
}

export interface RoundStartedEvent {
  roundId: string;
  playerIds: string[];
  timestamp: Date;
}

export interface RoundCompletedPlayerResult {
  playerId: string;
  /** True when this player finished first. */
  won: boolean;
  /** 1-based placement, or null when unranked. */
  placement: number | null;
  score?: number;
}

export interface RoundCompletedEvent {
  roundId: string;
  results: RoundCompletedPlayerResult[];
}

export interface RewardClaimableEvent {
  roundId: string;
  playerId: string;
  amount: string;
  asset?: string;
}

export interface NftMintedEvent {
  playerId: string;
  nftId: string;
  roundId?: string;
}

export interface RoundCancelledEvent {
  roundId: string;
  playerIds: string[];
  /** Refund amount per player, keyed by playerId. */
  refunds: Record<string, string>;
  reason?: string;
}

/**
 * IndexerService polls Soroban RPC for contract events and upserts database state.
 *
 * Responsibilities:
 * - Poll rpc.Server.getEvents() for both contract IDs
 * - Track cursor position for idempotency (restart-safe)
 * - Decode and validate events (round_created, round_joined, player_ready, etc.)
 * - Upsert chain_rounds, chain_round_players, chain_answers, chain_round_results, chain_nfts
 * - Emit events for real-time WebSocket broadcast
 * - Handle RPC outages gracefully (exponential backoff with jitter)
 * - Recover from RPC event-retention gaps via StateRecoveryService (LF-223)
 */
@Injectable()
export class IndexerService implements OnModuleInit {
  private readonly logger = new Logger(IndexerService.name);
  private currentCursor: string | null = null;
  private isProcessing = false;

  private readonly pageLimit = 100;
  private readonly maxBackoffMs = 60_000;
  private readonly baseBackoffMs = 1_000;

  private lastLedger: number | null = null;
  private latestLedger: number | null = null;
  private errorCount = 0;
  private consecutiveErrors = 0;
  private lastErrorAt: Date | null = null;
  private lastPollAt: Date | null = null;

  constructor(
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
    private dataSource: DataSource,
    private leaderboardService: LeaderboardService,
    // LF-340: used to upsert wager rows from escrow contract events.
    private wagerService: WagerService,
  ) {}

  async onModuleInit() {
    this.logger.log(
      'IndexerService initialized. Scheduled polling will start shortly.',
    );
    // Load last cursor from storage on startup for idempotency
    await this.loadCursorFromStorage();
  }

  /**
   * Poll for new events every 5 seconds (configurable)
   * Idempotent: uses stored cursor to avoid duplicate processing
   */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async indexEvents() {
    if (this.isProcessing) {
      return; // Skip if already processing
    }

    this.isProcessing = true;
    try {
      const rpcServerUrl = this.configService.get<string>('soroban.rpcUrl');
      const contractIds = this.configService.get<string[]>(
        'soroban.contractIds',
      );

      if (!rpcServerUrl || !contractIds || contractIds.length === 0) {
        this.logger.warn('Soroban RPC URL or contract IDs not configured');
        return;
      }

      for (const contractId of contractIds) {
        await this.pollAndProcessEvents(rpcServerUrl, contractId);
      }

    } catch (error) {
      this.logger.error(
        `Error during event indexing: ${error.message}`,
        error.stack,
      );
      // Continue on error; will retry on next cron tick
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Metrics snapshot for the health indicator (LF-232).
   */
  getMetrics(): IndexerMetrics {
    return {
      lastLedger: this.lastLedger,
      latestLedger: this.latestLedger,
      lag:
        this.lastLedger !== null && this.latestLedger !== null
          ? Math.max(0, this.latestLedger - this.lastLedger)
          : null,
      errorCount: this.errorCount,
      consecutiveErrors: this.consecutiveErrors,
      lastErrorAt: this.lastErrorAt,
      lastPollAt: this.lastPollAt,
      cursor: this.currentCursor,
    };
  }

  /**
   * Poll RPC for events and process them idempotently
   */
  private async pollAndProcessEvents(
    rpcServerUrl: string,
    contractId: string,
  ): Promise<void> {
    try {
      // TODO: Implement Soroban RPC polling
      // const client = new SorobanRpc.Server(rpcServerUrl);
      // const events = await client.getEvents({
      //   contractIds: [contractId],
      //   startLedger: this.getLedgerFromCursor(),
      //   cursor: this.currentCursor,
      // });

      // for (const event of events.records) {
      //   await this.processEvent(event, contractId);
      // }

      // this.currentCursor = events.pagingToken;
      // await this.saveCursorToStorage(this.currentCursor);

      this.logger.debug(
        `Polled contract ${contractId} at cursor ${this.currentCursor}`,
      );
    } catch (error) {
      this.logger.error(
        `RPC polling failed for contract ${contractId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Process a single event and upsert database records
   */
  private async processEvent(event: any, contractId: string): Promise<void> {
    try {
      const eventType = event.type;
      const transactionHash = event.transactionHash;
      const eventIndex = event.eventIndex;

      // Create composite key for idempotency
      const eventKey = `${contractId}:${transactionHash}:${eventIndex}`;

      // Check if already processed (idempotency)
      // const existing = await this.eventRepository.findOne({ where: { eventKey } });
      // if (existing) return;

      // LF-340: route escrow contract events to the wager projection.
      const escrowContractId = this.configService.get<string>(
        'soroban.escrowContractId',
      );
      if (escrowContractId && contractId === escrowContractId) {
        await this.processEscrowEvent(event, transactionHash);
        return;
      }

      switch (eventType) {
        case 'RoundCreated':
          await this.handleRoundCreated(event);
          break;
        case 'RoundJoined':
          await this.handleRoundJoined(event);
          break;
        case 'PlayerReady':
          await this.handlePlayerReady(event);
          break;
        case 'RoundStarted':
          await this.handleRoundStarted(event);
          break;
        case 'AnswerSubmitted':
          await this.handleAnswerSubmitted(event);
          break;
        case 'RoundCompleted':
          await this.handleRoundCompleted(event);
          break;
        case 'RewardClaimable':
          await this.handleRewardClaimable(event);
          break;
        case 'NftMinted':
          await this.handleNftMinted(event);
          break;
        case 'RoundCancelled':
          await this.handleRoundCancelled(event);
          break;
        default:
          this.logger.warn(`Unknown event type: ${eventType}`);
      }

      // Record as processed
      // await this.eventRepository.save({
      //   eventKey,
      //   contractId,
      //   eventType,
      //   transactionHash,
      //   eventIndex,
      //   processedAt: new Date(),
      // });

      this.logger.debug(`Processed ${eventType} event: ${eventKey}`);
    } catch (error) {
      this.logger.error(
        `Error processing event: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async handleRoundCreated(event: any): Promise<void> {
    // TODO: Insert into rounds table
    // Emit event for WebSocket broadcast
    this.eventEmitter.emit('round.created', {
      roundId: event.data.roundId,
      createdAt: new Date(),
    });
  }

  private async handleRoundJoined(event: any): Promise<void> {
    // TODO: Insert into round_players table
    // Notify the round admin that a player joined.
    const payload: RoundJoinedEvent = {
      roundId: event.data.roundId,
      adminId: event.data.adminId ?? event.data.ownerId,
      playerId: event.data.playerId,
      playerAddress: event.data.playerAddress,
    };
    this.eventEmitter.emit(IndexerDomainEvents.ROUND_JOINED, payload);
  }

  private async handlePlayerReady(event: any): Promise<void> {
    // TODO: Update round_players table
    this.eventEmitter.emit('player.ready', {
      roundId: event.data.roundId,
      playerId: event.data.playerId,
    });
  }

  private async handleRoundStarted(event: any): Promise<void> {
    // TODO: Update rounds.status = 'started'
    const payload: RoundStartedEvent = {
      roundId: event.data.roundId,
      playerIds: event.data.playerIds ?? [],
      timestamp: new Date(),
    };
    this.eventEmitter.emit(IndexerDomainEvents.ROUND_STARTED, payload);
  }

  private async handleAnswerSubmitted(event: any): Promise<void> {
    // TODO: Insert into answers table
    this.eventEmitter.emit('answer.submitted', {
      roundId: event.data.roundId,
      playerId: event.data.playerId,
      answer: event.data.answer,
    });
  }

  private async handleRoundCompleted(event: any): Promise<void> {
    // TODO: Update rounds, compute scores, insert into results
    const rawResults: any[] = event.data.results ?? [];
    const results: RoundCompletedPlayerResult[] = rawResults.map((result) => {
      const placement: number | null = result.placement ?? result.rank ?? null;
      return {
        playerId: result.playerId,
        won: result.won ?? placement === 1,
        placement,
        score: result.score,
      };
    });

    const payload: RoundCompletedEvent = {
      roundId: event.data.roundId,
      results,
    };
    this.eventEmitter.emit(IndexerDomainEvents.ROUND_COMPLETED, payload);
  }

  private async handleRewardClaimable(event: any): Promise<void> {
    const payload: RewardClaimableEvent = {
      roundId: event.data.roundId,
      playerId: event.data.playerId,
      amount: event.data.amount,
      asset: event.data.asset,
    };
    this.eventEmitter.emit(IndexerDomainEvents.REWARD_CLAIMABLE, payload);
  }

  private async handleNftMinted(event: any): Promise<void> {
    // TODO: Insert into nfts table
    const payload: NftMintedEvent = {
      playerId: event.data.playerId,
      nftId: event.data.nftId,
      roundId: event.data.roundId,
    };
    this.eventEmitter.emit(IndexerDomainEvents.NFT_MINTED, payload);
  }

  private async handleRoundCancelled(event: any): Promise<void> {
    const refunds: Record<string, string> = event.data.refunds ?? {};
    const payload: RoundCancelledEvent = {
      roundId: event.data.roundId,
      playerIds: event.data.playerIds ?? Object.keys(refunds),
      refunds,
      reason: event.data.reason,
    };
    this.eventEmitter.emit(IndexerDomainEvents.ROUND_CANCELLED, payload);
  }

  // -------------------------------------------------------------------------
  // LF-340: Escrow contract event handlers.
  //
  // The escrow contract emits Deposited, Refunded, Settled, and Claimed
  // events. The indexer decodes these and upserts Wager rows via
  // WagerService.upsertFromChainEvent — this is the only write path into
  // the wagers table. No client request can create or change a wager.
  //
  // Event topic layout (Soroban #[contractevent]):
  //   topic[0] = event name (symbol, e.g. "deposited")
  //   topic[1] = round_id (u64) — #[topic]
  //   topic[2] = player (Address) — #[topic] (per-player events only)
  //   value    = amount (i128) or a map (Settled)
  // -------------------------------------------------------------------------

  private async processEscrowEvent(event: any, txHash: string): Promise<void> {
    // The event name lives in topic[0] as a base64-encoded ScVal symbol.
    const eventName = scValToNative(event.topic?.[0]) as string;
    switch (eventName) {
      case EscrowEventNames.DEPOSITED:
        await this.handleEscrowDeposited(event, txHash);
        break;
      case EscrowEventNames.REFUNDED:
        await this.handleEscrowRefunded(event, txHash);
        break;
      case EscrowEventNames.SETTLED:
        await this.handleEscrowSettled(event, txHash);
        break;
      case EscrowEventNames.CLAIMED:
        await this.handleEscrowClaimed(event, txHash);
        break;
      default:
        // Locked, Cancelled, Swept, and admin events are not wager-relevant.
        this.logger.debug(`Ignoring non-wager escrow event: ${eventName}`);
    }
  }

  // Deposited { round_id, player, amount } — funds entered escrow.
  private async handleEscrowDeposited(event: any, txHash: string): Promise<void> {
    const roundId = String(scValToNative(event.topic?.[1]));
    const player = String(scValToNative(event.topic?.[2]));
    const amount = String(scValToNative(event.value));

    await this.wagerService.upsertFromChainEvent({
      roundId,
      player,
      amount,
      status: WagerStatus.ESCROWED,
      txHash,
    });
    this.logger.debug(`Escrow Deposited: round=${roundId} player=${player} amount=${amount}`);
  }

  // Refunded { round_id, player, amount } — wager returned (cancel/leave).
  private async handleEscrowRefunded(event: any, txHash: string): Promise<void> {
    const roundId = String(scValToNative(event.topic?.[1]));
    const player = String(scValToNative(event.topic?.[2]));
    const amount = String(scValToNative(event.value));

    await this.wagerService.upsertFromChainEvent({
      roundId,
      player,
      amount,
      status: WagerStatus.REFUNDED,
      txHash,
    });
    this.logger.debug(`Escrow Refunded: round=${roundId} player=${player} amount=${amount}`);
  }

  // Settled { round_id, winners, fee, claim_deadline } — round resolved.
  // Winners are marked WON; every other escrowed depositor is marked LOST.
  private async handleEscrowSettled(event: any, txHash: string): Promise<void> {
    const roundId = String(scValToNative(event.topic?.[1]));
    const value = scValToNative(event.value) as {
      winners?: string[];
      fee?: string | bigint;
      claim_deadline?: string | bigint;
    };
    const winners: string[] = (value?.winners ?? []).map(String);
    const winnerSet = new Set(winners);

    // Look up all wagers currently escrowed for this round and resolve them.
    const wagers = await this.wagerService.findByRound(roundId);
    for (const wager of wagers) {
      if (wager.status !== WagerStatus.ESCROWED) continue;
      const isWinner = winnerSet.has(wager.player);
      await this.wagerService.upsertFromChainEvent({
        roundId,
        player: wager.player,
        amount: wager.amount,
        status: isWinner ? WagerStatus.WON : WagerStatus.LOST,
        txHash,
      });
    }
    this.logger.debug(
      `Escrow Settled: round=${roundId} winners=${winners.length} resolved=${wagers.length}`,
    );
  }

  // Claimed { round_id, player, amount } — winner withdrew their share.
  private async handleEscrowClaimed(event: any, txHash: string): Promise<void> {
    const roundId = String(scValToNative(event.topic?.[1]));
    const player = String(scValToNative(event.topic?.[2]));
    const amount = String(scValToNative(event.value));

    await this.wagerService.upsertFromChainEvent({
      roundId,
      player,
      amount,
      status: WagerStatus.CLAIMED,
      txHash,
    });
    this.logger.debug(`Escrow Claimed: round=${roundId} player=${player} amount=${amount}`);
  }

  private loadCursorFromStorage(): void {
    // TODO: Load from indexer_state table or config
    this.currentCursor = null;
    this.logger.log('Loaded cursor from storage');
  }

  private async saveCursorToStorage(cursor: string): Promise<void> {
    // TODO: Save to indexer_state table
    this.logger.debug(`Saved cursor: ${cursor}`);
  }

  private getLedgerFromCursor(): number {
    // TODO: Parse cursor to extract ledger number
    return 0;
  }
}
