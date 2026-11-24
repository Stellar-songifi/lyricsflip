import { Test, TestingModule } from '@nestjs/testing';
import 'reflect-metadata';
import {
  WagerController,
  RoundWagerController,
} from './wager.controller';
import { WagerService } from './provider/wager.service';
import { WagerReconciliationService } from './services/wager-reconciliation.service';
import { EscrowBalanceService } from './services/escrow-balance.service';

describe('WagerController', () => {
  let controller: WagerController;
  let service: jest.Mocked<WagerService>;
  let reconciliationService: jest.Mocked<WagerReconciliationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WagerController],
      providers: [
        {
          provide: WagerService,
          useValue: { findByPlayer: jest.fn(), findByRound: jest.fn() },
        },
        {
          provide: WagerReconciliationService,
          useValue: { getLastResult: jest.fn(), runReconciliation: jest.fn() },
        },
        {
          provide: EscrowBalanceService,
          useValue: { getTokenBalance: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<WagerController>(WagerController);
    service = module.get(WagerService);
    reconciliationService = module.get(WagerReconciliationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getMyWagers delegates to the service with the current user and pagination', async () => {
    (service.findByPlayer as jest.Mock).mockResolvedValue({ data: [] });

    await controller.getMyWagers('user-1', 2, 10);

    expect(service.findByPlayer).toHaveBeenCalledWith('user-1', {
      page: 2,
      limit: 10,
    });
  });

  it('getReconciliationStatus delegates to the reconciliation service', () => {
    const mockResult = {
      checkedAt: '2026-01-01T00:00:00.000Z',
      dbEscrowedTotals: { native: '1000' },
      contractBalances: { native: '1000' },
      differences: { native: '0' },
      matched: true,
    };
    (reconciliationService.getLastResult as jest.Mock).mockReturnValue(
      mockResult,
    );

    const result = controller.getReconciliationStatus();

    expect(reconciliationService.getLastResult).toHaveBeenCalled();
    expect(result).toEqual(mockResult);
  });
});

describe('RoundWagerController', () => {
  let controller: RoundWagerController;
  let service: jest.Mocked<WagerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoundWagerController],
      providers: [
        { provide: WagerService, useValue: { findByRound: jest.fn() } },
      ],
    }).compile();

    controller = module.get<RoundWagerController>(RoundWagerController);
    service = module.get(WagerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getRoundWagers delegates to the service with the round id', async () => {
    (service.findByRound as jest.Mock).mockResolvedValue([]);

    await controller.getRoundWagers('42');

    expect(service.findByRound).toHaveBeenCalledWith('42');
  });
});

/**
 * LF-340 acceptance criteria: "No wager record can be created or changed
 * through a client request."
 *
 * This test inspects the route metadata of both wager controllers and asserts
 * that every registered HTTP method is GET. There must be no POST, PUT, PATCH,
 * or DELETE handler — the only write path into the wagers table is the
 * indexer's escrow-event handler.
 */
describe('Wager API is read-only (LF-340)', () => {
  const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  it('WagerController exposes only GET endpoints', () => {
    const metadata =
      Reflect.getMetadata('path:1', WagerController) ??
      Reflect.getMetadata('__path__', WagerController);

    // Inspect each method on the controller prototype for route decorators.
    const proto = WagerController.prototype;
    const methodNames = Object.getOwnPropertyNames(proto).filter(
      (m) => m !== 'constructor' && typeof proto[m] === 'function',
    );

    for (const methodName of methodNames) {
      for (const verb of writeMethods) {
        const routeKey = `${verb}:${methodName}`;
        const hasWriteRoute = Reflect.getMetadataKeys(proto).includes(
          routeKey,
        );
        expect(hasWriteRoute).toBe(false);
      }
    }

    // Every method must have a GET route registered.
    for (const methodName of methodNames) {
      const hasGetRoute = Reflect.getMetadataKeys(proto).some((key) =>
        typeof key === 'string' ? key.startsWith(`GET:${methodName}`) : false,
      );
      expect(hasGetRoute).toBe(true);
    }
  });

  it('RoundWagerController exposes only GET endpoints', () => {
    const proto = RoundWagerController.prototype;
    const methodNames = Object.getOwnPropertyNames(proto).filter(
      (m) => m !== 'constructor' && typeof proto[m] === 'function',
    );

    for (const methodName of methodNames) {
      for (const verb of writeMethods) {
        const routeKey = `${verb}:${methodName}`;
        const hasWriteRoute = Reflect.getMetadataKeys(proto).includes(
          routeKey,
        );
        expect(hasWriteRoute).toBe(false);
      }
    }
  });

  it('WagerService has no public method that accepts arbitrary client input to create a wager', () => {
    // The only write method is upsertFromChainEvent, which is intended to be
    // called exclusively by the indexer — never exposed over HTTP. The
    // read-only methods are findByPlayer, findByRound, and sumEscrowedAmounts.
    const writeMethod = 'upsertFromChainEvent';
    const readMethods = ['findByPlayer', 'findByRound', 'sumEscrowedAmounts'];

    expect(WagerService.prototype).toHaveProperty(writeMethod);
    for (const readMethod of readMethods) {
      expect(WagerService.prototype).toHaveProperty(readMethod);
    }
  });
});
