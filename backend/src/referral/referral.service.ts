import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateReferralDto } from './dto/create-referral.dto';
import { ClaimReferralDto } from './dto/claim-referral.dto';
import { Referral, ReferralStatus } from './entities/referral.entity';
import { User } from '../user/user.entity';
import { nanoid } from 'nanoid';

@Injectable()
export class ReferralService {
  constructor(
    @InjectRepository(Referral)
    private referralRepository: Repository<Referral>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async generateReferralCode(): Promise<string> {
    // Generate a unique 8-character referral code
    const code = nanoid(8);
    const existing = await this.referralRepository.findOne({
      where: { referralCode: code },
    });
    if (existing) {
      return this.generateReferralCode(); // Try again if code exists
    }
    return code;
  }

  async create(createReferralDto: CreateReferralDto): Promise<Referral> {
    const referrer = await this.userRepository.findOne({
      where: { id: createReferralDto.referrerId },
    });
    if (!referrer) {
      throw new NotFoundException('Referrer not found');
    }

    const referralCode = await this.generateReferralCode();

    const referral = this.referralRepository.create({
      referralCode,
      referrer,
      referrerId: referrer.id,
      status: ReferralStatus.PENDING,
      metadata: createReferralDto.metadata,
    });

    return this.referralRepository.save(referral);
  }

  async claim(claimReferralDto: ClaimReferralDto): Promise<Referral> {
    const referral = await this.referralRepository.findOne({
      where: { referralCode: claimReferralDto.referralCode },
      relations: ['referrer'],
    });

    if (!referral) {
      throw new NotFoundException('Referral code not found');
    }

    if (referral.status !== ReferralStatus.PENDING) {
      throw new ConflictException(
        'Referral code has already been used or expired',
      );
    }

    const referee = await this.userRepository.findOne({
      where: { id: claimReferralDto.refereeId },
    });
    if (!referee) {
      throw new NotFoundException('Referee not found');
    }

    if (referral.referrerId === referee.id) {
      throw new ConflictException(
        'Users cannot claim their own referral codes',
      );
    }

    // Update referral status
    referral.referee = referee;
    referral.refereeId = referee.id;
    referral.status = ReferralStatus.COMPLETED;
    referral.completedAt = new Date();

    // Calculate and set reward
    const reward = this.calculateReward(referral.referrer);
    referral.rewardDetails = {
      type: 'coins',
      amount: reward,
      status: 'pending',
    };

    await this.updateReferrerStats(referral.referrer);

    return this.referralRepository.save(referral);
  }

  private calculateReward(referrer: User): number {
    // Basic reward calculation - can be made more complex based on tiers
    const baseReward = 100;
    const referralCount = referrer.referralStats?.successfulReferrals || 0;

    // Bonus for more referrals
    if (referralCount >= 10) return baseReward * 2;
    if (referralCount >= 5) return baseReward * 1.5;
    return baseReward;
  }

  private async updateReferrerStats(referrer: User): Promise<void> {
    const stats = await this.referralRepository
      .createQueryBuilder('referral')
      .where('referral.referrerId = :referrerId', { referrerId: referrer.id })
      .select([
        'COUNT(*) as totalReferrals',
        'COUNT(CASE WHEN status = :completed THEN 1 END) as successfulReferrals',
        'COUNT(CASE WHEN status = :pending THEN 1 END) as pendingReferrals',
        'SUM(CASE WHEN "rewardDetails"->\'amount\' IS NOT NULL THEN ("rewardDetails"->\'amount\')::numeric ELSE 0 END) as totalRewardsEarned',
      ])
      .setParameter('completed', ReferralStatus.COMPLETED)
      .setParameter('pending', ReferralStatus.PENDING)
      .getRawOne();

    await this.userRepository.update(referrer.id, {
      referralStats: {
        totalReferrals: parseInt(stats.totalReferrals),
        successfulReferrals: parseInt(stats.successfulReferrals),
        pendingReferrals: parseInt(stats.pendingReferrals),
        totalRewardsEarned: parseFloat(stats.totalRewardsEarned) || 0,
      },
    });
  }

  async findAll(): Promise<Referral[]> {
    return this.referralRepository.find({
      relations: ['referrer', 'referee'],
    });
  }

  async findOne(id: string): Promise<Referral> {
    const referral = await this.referralRepository.findOne({
      where: { id },
      relations: ['referrer', 'referee'],
    });

    if (!referral) {
      throw new NotFoundException(`Referral #${id} not found`);
    }

    return referral;
  }

  async findByUser(userId: string): Promise<Referral[]> {
    return this.referralRepository.find({
      where: [{ referrerId: userId }, { refereeId: userId }],
      relations: ['referrer', 'referee'],
    });
  }

  async getAnalytics(): Promise<any> {
    const stats = await this.referralRepository
      .createQueryBuilder('referral')
      .select([
        'COUNT(*) as totalReferrals',
        'COUNT(CASE WHEN status = :completed THEN 1 END) as completedReferrals',
        'COUNT(CASE WHEN status = :pending THEN 1 END) as pendingReferrals',
        'AVG(CASE WHEN status = :completed THEN EXTRACT(EPOCH FROM (completed_at - created_at))/3600 END)::numeric(10,2) as avgCompletionTimeHours',
      ])
      .setParameter('completed', ReferralStatus.COMPLETED)
      .setParameter('pending', ReferralStatus.PENDING)
      .getRawOne();

    const topReferrers = await this.userRepository
      .createQueryBuilder('user')
      .select(['user.id', 'user.username', 'user.referralStats'])
      .orderBy('"referralStats"->>\'successfulReferrals\'', 'DESC')
      .limit(10)
      .getMany();

    return {
      globalStats: stats,
      topReferrers: topReferrers.map((user) => ({
        id: user.id,
        username: user.username,
        ...user.referralStats,
      })),
    };
  }
}
