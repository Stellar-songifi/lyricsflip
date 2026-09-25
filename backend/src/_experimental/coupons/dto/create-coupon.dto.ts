// src/coupons/dto/create-coupon.dto.ts
import { IsString, IsEnum, IsNumber, IsOptional, IsBoolean, IsDate, IsUUID, IsArray, Min, Max, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountType } from '../entities/coupon.entity';

export class CreateCouponDto {
  @IsString()
  code: string;

  @IsString()
  description: string;

  @IsEnum(DiscountType)
  discountType: DiscountType;

  @IsNumber()
  @Min(0)
  @ValidateIf(o => o.discountType === DiscountType.PERCENTAGE || o.discountType === DiscountType.FIXED_AMOUNT)
  discountValue: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumPurchaseAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maximumDiscountAmount?: number;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUsesPerUser?: number;

  @IsOptional()
  @IsBoolean()
  isFirstTimeOnly?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxTotalUses?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @ValidateIf(o => o.discountType === DiscountType.BUY_X_GET_Y)
  buyQuantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @ValidateIf(o => o.discountType === DiscountType.BUY_X_GET_Y)
  getQuantity?: number;

  @IsOptional()
  @IsBoolean()
  isGlobal?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  applicableItemIds?: string[];
}
