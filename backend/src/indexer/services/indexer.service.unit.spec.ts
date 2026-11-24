/**
 * IndexerService unit tests (LF-351).
 *
 * These tests run without a database by stubbing DataSource and
 * LeaderboardService. They verify event routing, metric tracking, and
 * the domain events emitted for each recognised event type.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  IndexerDomainEvents,
  IndexerService,
  RoundCancelledEvent,
  RoundCompletedEvent,
  RoundJoinedEvent,
  RoundStartedEvent,
  NftMintedEvent,
  RewardClaimableEvent,
} from './indexer.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildService(configOverrides: Record<string, unknown> = {}): {
  service: IndexerService;
  emitter: EventEmitter2;
} {
  const defaults: Record<string, unknown> = {
    'soroban.rpcUrl': 'http://rpc.test',
    'soroban.contractIds': ['CONTRACT-A'],
    'soroban.keeperEnabled': false,
    ...configOverrides,
  };

  const configService = {
    get: (key: string) => defaults[key],
  };

  const emitter = new EventEmitter2();
  const dataSource = { query: jest.fn() };
  const leaderboardService = { recordRoundResult: jest.fn() };

  // Build the service by hand to avoid the full NestJS DI stack
  // (and to skip @Cron registration which needs SchedulerRegistry).
  const service = new (IndexerService as any)(
    configService,
    emitter,
    dataSource,
    leaderboardService,
  );

  return { service, emitter };
}

/** Calls the private `processEvent` method via bracket notation. */
async function processEvent(
  service: IndexerService,
  event: Record<string, unknown>,
  contractId = 'CONTRACT-A',
): Promise<void> {
  return (service as any).processEvent(event, contractId);
}

// ---------------------------------------------------------------------------
// getMetrics()
// ---------------------------------------------------------------------------

describe('IndexerService.getMetrics', () => {
  it('returns null values for all numeric fields before any poll', () => {
    const { service } = buildService();
    const m = service.getMetrics();

    expect(m.lastLedger).toBeNull();
    expect(m.latestLedger).toBeNull();
    expect(m.lag).toBeNull();
    expect(m.errorCount).toBe(0);
    expect(m.consecutiveErrors).toBe(0);
    expect(m.lastErrorAt).toBeNull();
    expect(m.lastPollAt).toBeNull();
    expect(m.cursor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Event routing via processEvent
// ---------------------------------------------------------------------------

describe('IndexerService event routing', () => {
  let service: IndexerService;
  let emitter: EventEmitter2;

  beforeEach(() => {
    ({ service, emitter } = buildService());
  });

  it('emits round.created for RoundCreated events', async () => {
    const spy = jest.fn();
    emitter.on('round.created', spy);

    await processEvent(service, {
      type: 'RoundCreated',
      transactionHash: 'tx1',
      eventIndex: 0,
      data: { roundId: '1' },
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ roundId: '1' }),
    );
  });

  it('emits round.joined for RoundJoined events', async () => {
    const spy = jest.fn();
    emitter.on(IndexerDomainEvents.ROUND_JOINED, spy);

    await processEvent(service, {
      type: 'RoundJoined',
      transactionHash: 'tx2',
      eventIndex: 0,
      data: {
        roundId: '2',
        adminId: 'admin-1',
        playerId: 'player-1',
        playerAddress: 'GABC',
      },
    });

    const payload: RoundJoinedEvent = spy.mock.calls[0][0];
    expect(payload.roundId).toBe('2');
    expect(payload.adminId).toBe('admin-1');
    expect(payload.playerId).toBe('player-1');
    expect(payload.playerAddress).toBe('GABC');
  });

  it('falls back to ownerId when adminId is absent in RoundJoined', async () => {
    const spy = jest.fn();
    emitter.on(IndexerDomainEvents.ROUND_JOINED, spy);

    await processEvent(service, {
      type: 'RoundJoined',
      transactionHash: 'tx3',
      eventIndex: 0,
      data: { roundId: '3', ownerId: 'owner-1', playerId: 'p2' },
    });

    expect(spy.mock.calls[0][0].adminId).toBe('owner-1');
  });

  it('emits round.started for RoundStarted events', async () => {
    const spy = jest.fn();
    emitter.on(IndexerDomainEvents.ROUND_STARTED, spy);

    await processEvent(service, {
      type: 'RoundStarted',
      transactionHash: 'tx4',
      eventIndex: 0,
      data: { roundId: '4', playerIds: ['p1', 'p2'] },
    });

    const payload: RoundStartedEvent = spy.mock.calls[0][0];
    expect(payload.roundId).toBe('4');
    expect(payload.playerIds).toEqual(['p1', 'p2']);
  });

  it('emits round.completed for RoundCompleted with mapped player results', async () => {
    const spy = jest.fn();
    emitter.on(IndexerDomainEvents.ROUND_COMPLETED, spy);

    await processEvent(service, {
      type: 'RoundCompleted',
      transactionHash: 'tx5',
      eventIndex: 0,
      data: {
        roundId: '5',
        results: [
          { playerId: 'p1', won: true, placement: 1, score: 100 },
          { playerId: 'p2', won: false, placement: 2, score: 60 },
        ],
      },
    });

    const payload: RoundCompletedEvent = spy.mock.calls[0][0];
    expect(payload.roundId).toBe('5');
    expect(payload.results).toHaveLength(2);
    expect(payload.results[0]).toMatchObject({ playerId: 'p1', won: true, placement: 1 });
    expect(payload.results[1]).toMatchObject({ playerId: 'p2', won: false, placement: 2 });
  });

  it('derives won from placement===1 when the won flag is absent', async () => {
    const spy = jest.fn();
    emitter.on(IndexerDomainEvents.ROUND_COMPLETED, spy);

    await processEvent(service, {
      type: 'RoundCompleted',
      transactionHash: 'tx6',
      eventIndex: 0,
      data: {
        roundId: '6',
        results: [
          { playerId: 'p1', placement: 1 },
          { playerId: 'p2', placement: 2 },
        ],
      },
    });

    const { results } = spy.mock.calls[0][0] as RoundCompletedEvent;
    expect(results[0].won).toBe(true);
    expect(results[1].won).toBe(false);
  });

  it('emits reward.claimable for RewardClaimable events', async () => {
    const spy = jest.fn();
    emitter.on(IndexerDomainEvents.REWARD_CLAIMABLE, spy);

    await processEvent(service, {
      type: 'RewardClaimable',
      transactionHash: 'tx7',
      eventIndex: 0,
      data: { roundId: '7', playerId: 'p1', amount: '500', asset: 'XLM' },
    });

    const payload: RewardClaimableEvent = spy.mock.calls[0][0];
    expect(payload.amount).toBe('500');
    expect(payload.asset).toBe('XLM');
  });

  it('emits nft.minted for NftMinted events', async () => {
    const spy = jest.fn();
    emitter.on(IndexerDomainEvents.NFT_MINTED, spy);

    await processEvent(service, {
      type: 'NftMinted',
      transactionHash: 'tx8',
      eventIndex: 0,
      data: { playerId: 'p1', nftId: 'nft-42', roundId: '8' },
    });

    const payload: NftMintedEvent = spy.mock.calls[0][0];
    expect(payload.nftId).toBe('nft-42');
    expect(payload.roundId).toBe('8');
  });

  it('emits round.cancelled for RoundCancelled events and builds refund map', async () => {
    const spy = jest.fn();
    emitter.on(IndexerDomainEvents.ROUND_CANCELLED, spy);

    await processEvent(service, {
      type: 'RoundCancelled',
      transactionHash: 'tx9',
      eventIndex: 0,
      data: {
        roundId: '9',
        playerIds: ['p1', 'p2'],
        refunds: { p1: '100', p2: '200' },
        reason: 'timeout',
      },
    });

    const payload: RoundCancelledEvent = spy.mock.calls[0][0];
    expect(payload.roundId).toBe('9');
    expect(payload.refunds).toEqual({ p1: '100', p2: '200' });
    expect(payload.reason).toBe('timeout');
  });

  it('derives playerIds from refund keys when playerIds is absent in RoundCancelled', async () => {
    const spy = jest.fn();
    emitter.on(IndexerDomainEvents.ROUND_CANCELLED, spy);

    await processEvent(service, {
      type: 'RoundCancelled',
      transactionHash: 'tx10',
      eventIndex: 0,
      data: {
        roundId: '10',
        refunds: { pA: '50', pB: '50' },
      },
    });

    const payload: RoundCancelledEvent = spy.mock.calls[0][0];
    expect(payload.playerIds).toEqual(expect.arrayContaining(['pA', 'pB']));
  });

  it('emits player.ready for PlayerReady events', async () => {
    const spy = jest.fn();
    emitter.on('player.ready', spy);

    await processEvent(service, {
      type: 'PlayerReady',
      transactionHash: 'tx11',
      eventIndex: 0,
      data: { roundId: '11', playerId: 'p-ready' },
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ roundId: '11', playerId: 'p-ready' }),
    );
  });

  it('does not throw for unknown event types (logs a warning)', async () => {
    await expect(
      processEvent(service, {
        type: 'UnknownXyz',
        transactionHash: 'tx12',
        eventIndex: 0,
        data: {},
      }),
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// indexEvents() — cron gate
// ---------------------------------------------------------------------------

describe('IndexerService.indexEvents', () => {
  it('skips a poll cycle when isProcessing is already true (re-entrancy guard)', async () => {
    const { service } = buildService();
    // Force the re-entrancy flag on.
    (service as any).isProcessing = true;

    const pollSpy = jest
      .spyOn(service as any, 'pollAndProcessEvents')
      .mockResolvedValue(undefined);

    await service.indexEvents();

    expect(pollSpy).not.toHaveBeenCalled();
  });

  it('warns and returns early when no RPC URL or contract IDs are configured', async () => {
    const { service } = buildService({
      'soroban.rpcUrl': undefined,
      'soroban.contractIds': [],
    });

    const pollSpy = jest
      .spyOn(service as any, 'pollAndProcessEvents')
      .mockResolvedValue(undefined);

    await service.indexEvents();

    expect(pollSpy).not.toHaveBeenCalled();
  });

  it('releases the isProcessing flag even when an error occurs', async () => {
    const { service } = buildService();
    jest
      .spyOn(service as any, 'pollAndProcessEvents')
      .mockRejectedValue(new Error('rpc down'));

    await service.indexEvents();

    expect((service as any).isProcessing).toBe(false);
  });
});
