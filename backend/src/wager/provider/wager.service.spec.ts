import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WagerService } from './wager.service';
import { Wager, WagerStatus } from '../entities/wager.entity';

describe('WagerService', () => {
  let service: WagerService;
  let repository: jest.Mocked<Repository<Wager>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WagerService,
        {
          provide: getRepositoryToken(Wager),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              getRawMany: jest.fn(),
            })),
          },
        },
      ],
    }).compile();

    service = module.get<WagerService>(WagerService);
    repository = module.get(getRepositoryToken(Wager));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByPlayer', () => {
    it('paginates a player wager history, most recent first', async () => {
      const wagers = [{ id: '1' } as Wager];
      repository.findAndCount.mockResolvedValue([wagers, 1]);

      const result = await service.findByPlayer('GPLAYER', {
        page: 1,
        limit: 20,
      });

      expect(repository.findAndCount).toHaveBeenCalledWith({
        where: { player: 'GPLAYER' },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        data: wagers,
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('computes the correct offset for later pages', async () => {
      repository.findAndCount.mockResolvedValue([[], 0]);

      await service.findByPlayer('GPLAYER', { page: 3, limit: 10 });

      expect(repository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('findByRound', () => {
    it('returns wagers for a round in join order', async () => {
      const wagers = [{ id: '1' } as Wager];
      repository.find.mockResolvedValue(wagers);

      const result = await service.findByRound('42');

      expect(repository.find).toHaveBeenCalledWith({
        where: { roundId: '42' },
        order: { createdAt: 'ASC' },
      });
      expect(result).toBe(wagers);
    });
  });

  describe('upsertFromChainEvent', () => {
    it('creates a new wager on first sight of a round/player pair', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockImplementation((data) => ({ ...data }) as Wager);
      repository.save.mockImplementation(async (w) => w as Wager);

      const result = await service.upsertFromChainEvent({
        roundId: '1',
        player: 'GPLAYER',
        amount: '1000',
        status: WagerStatus.ESCROWED,
      });

      expect(repository.create).toHaveBeenCalledWith({
        roundId: '1',
        player: 'GPLAYER',
        amount: '1000',
        asset: 'native',
      });
      expect(result.status).toBe(WagerStatus.ESCROWED);
    });

    it('updates status and txHash on an existing wager instead of duplicating it', async () => {
      const existing: Wager = {
        id: 'w1',
        roundId: '1',
        player: 'GPLAYER',
        amount: '1000',
        asset: 'native',
        txHash: null,
        status: WagerStatus.ESCROWED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      repository.findOne.mockResolvedValue(existing);
      repository.save.mockImplementation(async (w) => w as Wager);

      const result = await service.upsertFromChainEvent({
        roundId: '1',
        player: 'GPLAYER',
        amount: '1000',
        status: WagerStatus.WON,
        txHash: '0xabc',
      });

      expect(repository.create).not.toHaveBeenCalled();
      expect(result.status).toBe(WagerStatus.WON);
      expect(result.txHash).toBe('0xabc');
    });
  });

  describe('sumEscrowedAmounts', () => {
    it('sums escrowed wager amounts grouped by asset', async () => {
      const qb = repository.createQueryBuilder();
      qb.getRawMany.mockResolvedValue([
        { asset: 'native', total: '1500000000' },
        { asset: 'USDC', total: '5000000' },
      ]);

      const result = await service.sumEscrowedAmounts();

      expect(qb.select).toHaveBeenCalledWith('wager.asset', 'asset');
      expect(qb.addSelect).toHaveBeenCalledWith(
        'COALESCE(SUM(wager.amount), 0)',
        'total',
      );
      expect(qb.where).toHaveBeenCalledWith('wager.status = :status', {
        status: WagerStatus.ESCROWED,
      });
      expect(qb.groupBy).toHaveBeenCalledWith('wager.asset');
      expect(result).toEqual({
        native: '1500000000',
        USDC: '5000000',
      });
    });

    it('returns an empty object when no escrowed wagers exist', async () => {
      const qb = repository.createQueryBuilder();
      qb.getRawMany.mockResolvedValue([]);

      const result = await service.sumEscrowedAmounts();

      expect(result).toEqual({});
    });
  });
});
