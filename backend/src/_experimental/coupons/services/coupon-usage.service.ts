// src/coupons/services/coupon-usage.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Coupon } from '../entities/coupon.entity';
import { CouponUsage } from '../entities/coupon-usage.entity';
import { User } from '../../users/entities/user.entity';
import { Order } from '../../orders/entities/order.entity';

@Injectable()
export class CouponUsageService {
  constructor(
    @InjectRepository(CouponUsage)
    private couponUsageRepository: Repository<CouponUsage>,
    @InjectRepository(Coupon)
    private couponRepository: Repository<Coupon>,
  ) {}

  async recordUsage(
    coupon: Coupon,
    user: User,
    order: Order,
    discountAmount: number,
  ): Promise<CouponUsage> {
    // Create coupon usage record
    const usage = this.couponUsageRepository.create({
      coupon,
      user,
      order,
      discountAmount,
      orderTotal: order.total,
    });

    // Increment coupon usage count
    coupon.currentUses += 1;
    await this.couponRepository.save(coupon);

    return this.couponUsageRepository.save(usage);
  }

  async getUserCouponUsage(userId: string, couponId?: string): Promise<CouponUsage[]> {
    const query = {
      where: {
        user: { id: userId },
      },
      relations: ['coupon', 'order'],
    };

    if (couponId) {
      query.where['coupon'] = { id: couponId };
    }

    return this.couponUsageRepository.find(query);
  }

  async getCouponUsageAnalytics(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalUsage: number;
    totalDiscountAmount: number;
    couponUsageCount: Record<string, number>;
  }> {
    const usages = await this.couponUsageRepository.find({
      where: {
        usedAt: Between(startDate, endDate),
      },
      relations: ['coupon'],
    });

    const totalUsage = usages.length;
    const totalDiscountAmount = usages.reduce((sum, usage) => sum + Number(usage.discountAmount), 0);
    
    const couponUsageCount: Record<string, number> = {};
    
    for (const usage of usages) {
      const couponCode = usage.coupon.code;
      couponUsageCount[couponCode] = (couponUsageCount[couponCode] || 0) + 1;
    }

    return {
      totalUsage,
      totalDiscountAmount,
      couponUsageCount,
    };
  }
}
