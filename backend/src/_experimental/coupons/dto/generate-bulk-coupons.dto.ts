// src/coupons/dto/generate-bulk-coupons.dto.ts
import { IsNumber, IsString, IsOptional, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateCouponDto } from './create-coupon.dto';

export class GenerateBulkCouponsDto {
  @IsNumber()
  @Min(1)
  count: number;

  @IsOptional()
  @IsString()
  prefix?: string;

  @ValidateNested()
  @Type(() => CreateCouponDto)
  baseProperties: Omit<CreateCouponDto, 'code'>;
}
