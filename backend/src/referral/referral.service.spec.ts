import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ReferralService, ReferralSignupEvent } from './referral.service';
import { Referral, ReferralStatus } from '../social/entities/referral.entity';
import { ReferralCredit } from './entities/referral-credit.entity';
import { User } from '../user/user.entity';
import { ChainRoundPlayer } from '../indexer/entities/indexer-state.entity';
import { RoundCompletedEvent } from '../indexer/services/indexer.service';

// ---------------------------------------------------------------------------
// Minimal repository / datasource fakes
// ---------------------------------------------------------------------------

const makeRepo = (overrides: Partial<Record<string, jest.Mock>> = {}) => ({
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  save: jest.fn(),
  create: jest.fn((v: any) => v),
  count: jest.fn().mockResolvedValue(0),
  update: jest.fn(),
  increment: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ minLedger: null }),
  }),
  ...overrides,
});

const makeTxManager = (repos: { [token: string]: any }) => ({
  findOne: jest.fn(async (entity: any, opts: any) => {
    // route to the right repo mock based on entity class
    for (const [, repo] of Object.entries(repos)) {
      if (repo.findOne) return repo.findOne(opts);
    }
    return null;
  }),
  findOneOrFail: jest.fn(async (entity: any, opts: any) => {
    // return a bare user with default stats
    return { id: 'referrer-id', referralStats: null };
  }),
  update: jest.fn(),
  increment: jest.fn(),
  save: jest.fn(),
  create: jest.fn((entity: any, data: any) => data),
});

describe('ReferralService', () => {
  let service: ReferralService;
  let referralRepo: ReturnType<typeof makeRepo>;
  let creditRepo: ReturnType<typeof makeRepo>;
  let userRepo: ReturnType<typeof makeRepo>;
  let roundPlayerRepo: ReturnType<typeof makeRepo>;
  let dataSource: { transaction: jest.Mock };

  const REFERRER: Partial<User> = {
    id: 'referrer-id',
    stellarAddress: 'GREFERRER',
    referralCode: 'CODE123',
    referralStats: {
      totalReferrals: 1,
      successfulReferrals: 0,
      pendingReferrals: 1,
      totalRewardsEarned: 0,
    },
  };

  const REFEREE: Partial<User> = {
    id: 'referee-id',
    stellarAddress: 'GREFEREE',
  };

  const PENDING_REFERRAL: Partial<Referral> = {
    id: 'ref-row-id',
    referralCode: 'CODE123',
    referrerId: 'referrer-id',
    refereeId: 'referee-id',
    status: ReferralStatus.PENDING,
    firstRoundId: null,
  };

  beforeEach(async () => {
    referralRepo = makeRepo();
    creditRepo = makeRepo();
    userRepo = makeRepo();
    roundPlayerRepo = makeRepo();
    dataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralService,
        { provide: getRepositoryToken(Referral), useValue: referralRepo },
        { provide: getRepositoryToken(ReferralCredit), useValue: creditRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(ChainRoundPlayer), useValue: roundPlayerRepo },
        { provide: DataSource, useValue: dataSource },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'referral.rewardPoints') return 50;
              if (key === 'referral.minAccountAgeLedgers') return 0; // disabled for most tests
              if (key === 'referral.maxCreditsPerDay') return 10;
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get(ReferralService);
  });

  // ---- handleReferralSignup -------------------------------------------------

  describe('handleReferralSignup', () => {
    it('creates a PENDING referral when code is valid', async () => {
      userRepo.findOne.mockResolvedValueOnce(REFERRER);
      referralRepo.findOne.mockResolvedValueOnce(null); // no existing referral

      const event: ReferralSignupEvent = {
        newUserId: 'referee-id',
        referralCode: 'CODE123',
      };
      await service.handleReferralSignup(event);

      expect(referralRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          referrerId: 'referrer-id',
          refereeId: 'referee-id',
          status: ReferralStatus.PENDING,
        }),
      );
    });

    it('skips when referral code does not exist', async () => {
      userRepo.findOne.mockResolvedValueOnce(null);

      await service.handleReferralSignup({ newUserId: 'x', referralCode: 'NOPE' });

      expect(referralRepo.save).not.toHaveBeenCalled();
    });

    it('skips self-referral', async () => {
      userRepo.findOne.mockResolvedValueOnce({ ...REFERRER, id: 'same-id' });

      await service.handleReferralSignup({ newUserId: 'same-id', referralCode: 'CODE123' });

      expect(referralRepo.save).not.toHaveBeenCalled();
    });

    it('is idempotent: does not create duplicate referral', async () => {
      userRepo.findOne.mockResolvedValueOnce(REFERRER);
      referralRepo.findOne.mockResolvedValueOnce(PENDING_REFERRAL); // already exists

      await service.handleReferralSignup({ newUserId: 'referee-id', referralCode: 'CODE123' });

      expect(referralRepo.save).not.toHaveBeenCalled();
    });
  });

  // ---- handleRoundCompleted ------------------------------------------------

  describe('handleRoundCompleted', () => {
    const roundEvent: RoundCompletedEvent = {
      roundId: 'round-1',
      results: [
        { playerId: 'GREFEREE', won: false, placement: 2, score: 10 },
        { playerId: 'GOTHER',   won: true,  placement: 1, score: 20 },
      ],
    };

    beforeEach(() => {
      userRepo.findOne
        .mockResolvedValueOnce(REFEREE)       // first result: referee
        .mockResolvedValueOnce(null)           // second result: unknown player
        .mockResolvedValue(REFERRER);          // referrer lookup inside issueReward

      referralRepo.findOne
        .mockResolvedValueOnce(PENDING_REFERRAL)
        .mockResolvedValue(null);

      roundPlayerRepo.findOne.mockResolvedValue({ joinedLedger: 500 });

      const txManager = makeTxManager({});
      txManager.findOneOrFail.mockResolvedValue({ ...REFERRER });
      dataSource.transaction.mockImplementation((cb: (m: any) => Promise<void>) =>
        cb(txManager),
      );
    });

    it('issues reward for the referee in a 2-player round', async () => {
      await service.handleRoundCompleted(roundEvent);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('skips solo rounds (< 2 players)', async () => {
      const soloEvent: RoundCompletedEvent = {
        roundId: 'round-solo',
        results: [{ playerId: 'GREFEREE', won: true, placement: 1 }],
      };
      await service.handleRoundCompleted(soloEvent);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects same-round self-referral (referrer played in the same round)', async () => {
      // Reset mocks — referrer is ALSO in the round.
      userRepo.findOne
        .mockResolvedValueOnce(REFEREE)
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ ...REFERRER, stellarAddress: 'GOTHER' }); // referrer = GOTHER

      referralRepo.findOne.mockResolvedValueOnce(PENDING_REFERRAL).mockResolvedValue(null);
      roundPlayerRepo.findOne.mockResolvedValue({ joinedLedger: 500 });

      await service.handleRoundCompleted(roundEvent);

      // GOTHER is in the round → referral should be rejected.
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects when daily cap is reached', async () => {
      creditRepo.count.mockResolvedValue(10); // already at cap

      await service.handleRoundCompleted(roundEvent);

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });
});
