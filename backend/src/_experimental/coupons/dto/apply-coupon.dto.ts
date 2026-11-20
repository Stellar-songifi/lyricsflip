// src/coupons/dto/apply-coupon.dto.ts
import { IsString } from 'class-validator';

export class ApplyCouponDto {
  @IsString()
  code: string;
}
