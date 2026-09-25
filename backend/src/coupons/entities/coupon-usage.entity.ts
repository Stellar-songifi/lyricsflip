// src/coupons/entities/coupon-usage.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Coupon } from './coupon.entity';
import { User } from '../../user/user.entity';

@Entity()
export class CouponUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Coupon, (coupon) => coupon.usages)
  @JoinColumn()
  coupon: Coupon;

  @ManyToOne(() => User)
  @JoinColumn()
  user: User;

  // No `order` relation: there's no Order entity yet (the store/coupons
  // modules never got one) — `orderTotal` below records what's needed for
  // now. Add the relation back once an Order entity exists.

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  discountAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  orderTotal: number;

  @CreateDateColumn()
  usedAt: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any>; // Additional tracking data
}
