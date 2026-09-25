// src/coupons/controllers/coupon.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { CouponService } from '../services/coupon.service';
import { CreateCouponDto } from '../dto/create-coupon.dto';
import { UpdateCouponDto } from '../dto/update-coupon.dto';
import { GenerateBulkCouponsDto } from '../dto/generate-bulk-coupons.dto';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('coupons')
@ApiBearerAuth()
@Controller('admin/coupons')
@UseGuards(AdminGuard)
export class CouponAdminController {
  constructor(private readonly couponService: CouponService) {}

  @Post()
  create(@Body() createC