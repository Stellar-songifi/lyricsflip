import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WagerService } from '../provider/wager.service';
import { EscrowBalanceService } from './escrow-balance.service';
import { WagerReconciliationService } from './wager-reconciliation.service';
import { WagerStatus } from '../entities/wager.entity';

describe('WagerReconciliationService', () => {
  let service: WagerReconciliationService;
  let wagerService: jest.Mocked<WagerService>;
  let escrowBalanceService: jest.Mocked<EscrowBalanceService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WagerReconciliationService,
        {
          provide: WagerService,
          useValue: {
            sumEscrowedAmounts: jest.fn(),
            findByPlayer: jest.fn(),
            findByRound: jest.fn(),
            upsertFromChainEvent: jest.fn(),
          },
        },
        {
          provide: EscrowBalanceService,
          useValue: { getTokenBalance: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, unknown> = {
                'soroban.escrowContractId': 'CEXCONTRACT',
                'soroban.nativeTokenContractId': 'CTOKEN',
                'wager.reconciliationTolerance': '0',
              };
              return map[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get(WagerReconciliationService);
    wagerService = module.get(WagerService);
    escrowBalanceService = module.get(EscrowBalanceService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runReconciliation', () => {
    it('reports matched when DB total equals contract balance', async () => {
      wagerService.sumEscrowedAmounts.mockResolvedValue({ native: '1000' });
      escrowBalanceService.getTokenBalance.mockResolvedValue('1000');

      const result = await service.runReconciliation();

      expect(result.matched).toBe(true);
      expect(result.dbEscrowedTotals).toEqual({ native: '1000' });
      expect(result.contractBalances).toEqual({ native: '1000' });
      expect(result.differences).toEqual({ native: '0' });
      expect(result.alert).toBeUndefined();
    });

    it('alerts when DB total differs from contract balance', async () => {
      wagerService.sumEscrowedAmounts.mockResolvedValue({ native: '1000' });
      escrowBalanceService.getTokenBalance.mockResolvedValue('800');

      const result = await service.runReconciliation();

      expect(result.matched).toBe(false);
      expect(result.differences).toEqual({ native: '-200' });
      expect(result.alert).toContain('mismatch');
    });

    it('respects tolerance for small deltas', async () => {
      // Set tolerance to 50
      configService.get.mockImplementation((key: string) => {
        const map: Record<string, unknown> = {
          'soroban.escrowContractId': 'CEXCONTRACT',
          'soroban.nativeTokenContractId': 'CTOKEN',
          'wager.reconciliationTolerance': '50',
        };
        return map[key];
      });
      // Recreate the service with the new tolerance
      const module = await Test.createTestingModule({
        providers: [
          WagerReconciliationService,
          {
            provide: WagerService,
            useValue: {
              sumEscrowedAmounts: jest.fn().mockResolvedValue({ native: '1000' }),
              findByPlayer: jest.fn(),
              findByRound: jest.fn(),
              upsertFromChainEvent: jest.fn(),
            },
          },
          {
            provide: EscrowBalanceService,
            useValue: { getTokenBalance: jest.fn().mockResolvedValue('1030') },
          },
          {
            provide: ConfigService,
            useValue: { get: configService.get },
          },
        ],
      }).compile();
      service = module.get(WagerReconciliationService);

      const result = await service.runReconciliation();

      // 30 is within tolerance of 50
      expect(result.matched).toBe(true);
    });

    it('skips on-chain check when escrow contract ID is not configured', async () => {
      configService.get.mockImplementation((key: string) => {
        const map: Record<string, unknown> = {
          'soroban.escrowContractId': undefined,
          'soroban.nativeTokenContractId': 'CTOKEN',
          'wager.reconciliationTolerance': '0',
        };
        return map[key];
      });
      wagerService.sumEscrowedAmounts.mockResolvedValue({ native: '1000' });

      const result = await service.runReconciliation();

      expect(escrowBalanceService.getTokenBalance).not.toHaveBeenCalled();
      expect(result.matched).toBe(false);
      expect(result.alert).toContain('not configured');
    });

    it('skips assets with no token contract mapping', async () => {
      configService.get.mockImplementation((key: string) => {
        const map: Record<string, unknown> = {
          'soroban.escrowContractId': 'CEXCONTRACT',
          'soroban.nativeTokenContractId': undefined,
          'wager.reconciliationTolerance': '0',
        };
        return map[key];
      });
      wagerService.sumEscrowedAmounts.mockResolvedValue({ native: '1000' });

      const result = await service.runReconciliation();

      expect(escrowBalanceService.getTokenBalance).not.toHaveBeenCalled();
      expect(result.contractBalances).toEqual({});
    });

    it('caches the last result for the monitoring endpoint', async () => {
      wagerService.sumEscrowedAmounts.mockResolvedValue({ native: '1000' });
      escrowBalanceService.getTokenBalance.mockResolvedValue('1000');

      await service.runReconciliation();

      const cached = service.getLastResult();
      expect(cached).not.toBeNull();
      expect(cached!.matched).toBe(true);
    });
  });
});
