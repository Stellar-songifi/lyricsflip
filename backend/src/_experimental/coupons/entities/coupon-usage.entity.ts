// src/coupons/entities/coupon-usage.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Coupon } from './coupon.entity';
import { User } from '../../users/entities/user.entity';
import { Order } from '../../orders/entities/order.entity';

@Entity()
export class CouponUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Coupon, coupon => coupon.usages)
  @JoinColumn()
  coupon: Coupon;

  @ManyToOne(() => User)
  @JoinColumn()
  user: User;

  @ManyToOne(() => Order)
  @JoinColumn()
  order: Order;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  discountAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  orderTotal: number;

  @CreateDateColumn()
  usedAt: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any>; // Additional tracking data
}

