// src/coupons/entities/coupon.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import { StoreItem } from '../../store/entities/store-item.entity';
import { CouponUsage } from './coupon-usage.entity';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount',
  BUY_X_GET_Y = 'buy_x_get_y',
  FREE_SHIPPING = 'free_shipping',
}

export enum CouponStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  EXPIRED = 'expired',
  DEPLETED = 'depleted',
}

@Entity()
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  description: string;

  @Column({
    type: 'enum',
    enum: DiscountType,
    default: DiscountType.PERCENTAGE,
  })
  discountType: DiscountType;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discountValue: number; // Percentage or fixed amount

  @Column({ nullable: true })
  minimumPurchaseAmount: number;

  @Column({ nullable: true })
  maximumDiscountAmount: number;

  @Column({
    type: 'enum',
    enum: CouponStatus,
    default: CouponStatus.ACTIVE,
  })
  status: CouponStatus;

  @Column({ nullable: true })
  startDate: Date;

  @Column({ nullable: true })
  endDate: Date;

  @Column({ default: 1 })
  maxUsesPerUser: number;

  @Column({ default: false })
  isFirstTimeOnly: boolean;

  @Column({ nullable: true })
  maxTotalUses: number;

  @Column({ default: 0 })
  currentUses: number;

  @Column({ nullable: true })
  buyQuantity: number; // For buy X get Y discounts

  @Column({ nullable: true })
  getQuantity: number; // For buy X get Y discounts

  @Column({ default: false })
  isGlobal: boolean; // Applies to all items if true

  @ManyToMany(() => StoreItem)
  @JoinTable()
  applicableItems: StoreItem[]; // Specific items this coupon applies to

  @OneToMany(() => CouponUsage, usage => usage.coupon)
  usages: CouponUsage[];

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any>; // For additional custom properties

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy: string; // Admin user ID
}