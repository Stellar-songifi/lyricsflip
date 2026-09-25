// src/coupons/services/coupon-validator.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon, CouponStatus } from '../entities/coupon.entity';
import { CouponUsage } from '../entities/coupon-usage.entity';
import { User } from '../../users/entities/user.entity';
import { CartItem } from '../../cart/entities/cart-item.entity';

interface ValidationResult {
  isValid: boolean;
  coupon?: Coupon;
  errorMessage?: string;
}

@Injectable()
export class CouponValidatorService {
  constructor(
    @InjectRepository(Coupon)
    private couponRepository: Repository<Coupon>,
    @InjectRepository(CouponUsage)
    private couponUsageRepository: Repository<CouponUsage>,
  ) {}

  async validateCoupon(
    code: string,
    user: User,
    cartItems: CartItem[],
    cartTotal: number,
  ): Promise<ValidationResult> {
    const coupon = await this.couponRepository.findOne({
      where: { code },
      relations: ['applicableItems', 'usages'],
    });

    if (!coupon) {
      return {
        isValid: false,
        errorMessage: 'Invalid coupon code',
      };
    }

    // Check coupon status
    if (coupon.status !== CouponStatus.ACTIVE) {
      return {
        isValid: false,
        errorMessage: Coupon is ${coupon.status.toLowerCase()},
      };
    }

    // Check date validity
    const now = new Date();
    if (coupon.startDate && coupon.startDate > now) {
      return {
        isValid: false,
        errorMessage: 'Coupon is not yet active',
      };
    }

    if (coupon.endDate && coupon.endDate < now) {
      // Update coupon status to expired
      coupon.status = CouponStatus.EXPIRED;
      await this.couponRepository.save(coupon);
      
      return {
        isValid: false,
        errorMessage: 'Coupon has expired',
      };
    }

    // Check usage limits
    if (coupon.maxTotalUses && coupon.currentUses >= coupon.maxTotalUses) {
      // Update coupon status to depleted
      coupon.status = CouponStatus.DEPLETED;
      await this.couponRepository.save(coupon);
      
      return {
        isValid: false,
        errorMessage: 'Coupon usage limit has been reached',
      };
    }

    // Check per-user usage limits
    const userUsages = await this.couponUsageRepository.count({
      where: {
        coupon: { id: coupon.id },
        user: { id: user.id },
      },
    });

    if (userUsages >= coupon.maxUsesPerUser) {
      return {
        isValid: false,
        errorMessage: You've already used this coupon ${userUsages} time(s),
      };
    }

    // Check first-time user restriction
    if (coupon.isFirstTimeOnly) {
      const anyUserPurchase = await this.couponUsageRepository.findOne({
        where: {
          user: { id: user.id },
        },
      });

      if (anyUserPurchase) {
        return {
          isValid: false,
          errorMessage: 'This coupon is for first-time purchases only',
        };
      }
    }

    // Check minimum purchase amount
    if (coupon.minimumPurchaseAmount && cartTotal < coupon.minimumPurchaseAmount) {
      return {
        isValid: false,
        errorMessage: Minimum purchase amount of ${coupon.minimumPurchaseAmount} required,
      };
    }

    // Check item applicability
    if (!coupon.isGlobal && coupon.applicableItems.length > 0) {
      const applicableItemIds = coupon.applicableItems.map(item => item.id);
      const hasApplicableItem = cartItems.some(item => 
        applicableItemIds.includes(item.storeItem.id)
      );

      if (!hasApplicableItem) {
        return {
          isValid: false,
          errorMessage: 'Coupon does not apply to any items in your cart',
        };
      }
    }

    return {
      isValid: true,
      coupon,
    };
  }
}
