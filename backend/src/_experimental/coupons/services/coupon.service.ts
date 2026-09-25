// src/coupons/services/coupon.service.ts
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual, MoreThanOrEqual, IsNull } from 'typeorm';
import { Coupon, CouponStatus, DiscountType } from '../entities/coupon.entity';
import { StoreItem } from '../../store/entities/store-item.entity';
import { CreateCouponDto } from '../dto/create-coupon.dto';
import { UpdateCouponDto } from '../dto/update-coupon.dto';
import { CouponGeneratorService } from './coupon-generator.service';

@Injectable()
export class CouponService {
  constructor(
    @InjectRepository(Coupon)
    private couponRepository: Repository<Coupon>,
    @InjectRepository(StoreItem)
    private storeItemRepository: Repository<StoreItem>,
    private couponGeneratorService: CouponGeneratorService,
  ) {}

  async create(createCouponDto: CreateCouponDto): Promise<Coupon> {
    const existingCoupon = await this.couponRepository.findOne({
      where: { code: createCouponDto.code },
    });

    if (existingCoupon) {
      throw new ConflictException(Coupon with code ${createCouponDto.code} already exists);
    }

    let applicableItems: StoreItem[] = [];
    if (createCouponDto.applicableItemIds && createCouponDto.applicableItemIds.length > 0) {
      applicableItems = await this.storeItemRepository.find({
        where: { id: In(createCouponDto.applicableItemIds) },
      });
    }

    const coupon = this.couponRepository.create({
      ...createCouponDto,
      applicableItems,
    });

    return this.couponRepository.save(coupon);
  }

  async findAll(): Promise<Coupon[]> {
    return this.couponRepository.find({
      relations: ['applicableItems'],
    });
  }

  async findOne(id: string): Promise<Coupon> {
    const coupon = await this.couponRepository.findOne({
      where: { id },
      relations: ['applicableItems'],
    });

    if (!coupon) {
      throw new NotFoundException(Coupon with ID ${id} not found);
    }

    return coupon;
  }

  async findByCode(code: string): Promise<Coupon> {
    const coupon = await this.couponRepository.findOne({
      where: { code },
      relations: ['applicableItems'],
    });

    if (!coupon) {
      throw new NotFoundException(Coupon with code ${code} not found);
    }

    return coupon;
  }

  async update(id: string, updateCouponDto: UpdateCouponDto): Promise<Coupon> {
    const coupon = await this.findOne(id);

    if (updateCouponDto.code && updateCouponDto.code !== coupon.code) {
      const existingCoupon = await this.couponRepository.findOne({
        where: { code: updateCouponDto.code },
      });

      if (existingCoupon && existingCoupon.id !== id) {
        throw new ConflictException(Coupon with code ${updateCouponDto.code} already exists);
      }
    }

    let applicableItems: StoreItem[] = coupon.applicableItems;
    if (updateCouponDto.applicableItemIds) {
      applicableItems = await this.storeItemRepository.find({
        where: { id: In(updateCouponDto.applicableItemIds) },
      });
    }

    // Update coupon properties
    Object.assign(coupon, {
      ...updateCouponDto,
      applicableItems,
    });

    return this.couponRepository.save(coupon);
  }

  async remove(id: string): Promise<void> {
    const coupon = await this.findOne(id);
    await this.couponRepository.remove(coupon);
  }

  async generateBulkCoupons(
    count: number,
    baseProperties: Omit<CreateCouponDto, 'code'>,
    prefix?: string,
  ): Promise<Coupon[]> {
    const coupons: Coupon[] = [];
    
    let applicableItems: StoreItem[] = [];
    if (baseProperties.applicableItemIds && baseProperties.applicableItemIds.length > 0) {
      applicableItems = await this.storeItemRepository.find({
        where: { id: In(baseProperties.applicableItemIds) },
      });
    }

    for (let i = 0; i < count; i++) {
      const code = this.couponGeneratorService.generateUniqueCode(prefix);
      
      const coupon = this.couponRepository.create({
        ...baseProperties,
        code,
        applicableItems,
      });
      
      coupons.push(coupon);
    }

    return this.couponRepository.save(coupons);
  }

  async updateCouponStatuses(): Promise<void> {
    const now = new Date();
    
    // Find expired coupons
    const expiredCoupons = await this.couponRepository.find({
      where: {
        status: CouponStatus.ACTIVE,
        endDate: LessThanOrEqual(now),
      },
    });
    
    if (expiredCoupons.length > 0) {
      for (const coupon of expiredCoupons) {
        coupon.status = CouponStatus.EXPIRED;
      }
      
      await this.couponRepository.save(expiredCoupons);
    }
    
    // Find coupons that should now be active
    const newlyActiveCoupons = await this.couponRepository.find({
      where: {
        status: CouponStatus.INACTIVE,
        startDate: LessThanOrEqual(now),
        endDate: MoreThanOrEqual(now),
      },
    });
    
    if (newlyActiveCoupons.length > 0) {
      for (const coupon of newlyActiveCoupons) {
        coupon.status = CouponStatus.ACTIVE;
      }
      
      await this.couponRepository.save(newlyActiveCoupons);
    }
  }
}
