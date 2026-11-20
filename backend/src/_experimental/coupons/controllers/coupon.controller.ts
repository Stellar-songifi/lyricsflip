// src/coupons/controllers/coupon.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { CouponService } from '../services/coupon.service';
import { CreateCouponDto } from '../dto/create-coupon.dto';
import { UpdateCouponDto } from '../dto/update-coupon.dto';
import { GenerateBulkCouponsDto } from '../dto/generate-bulk-coupons.dto';
import { AccessTokenGuard } from '../../../auth/guard/access-token/access-token.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('coupons')
@ApiBearerAuth()
@Controller('admin/coupons')
@UseGuards(AccessTokenGuard)
export class CouponAdminController {
  constructor(private readonly couponService: CouponService) {}

  @Post()
  create(@Body() createCouponDto: CreateCouponDto) {
    return this.couponService.create(createCouponDto);
  }

  @Get()
  findAll() {
    return this.couponService.findAll();
  }

  @Get('code/:code')
  findByCode(@Param('code') code: string) {
    return this.couponService.findByCode(code);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.couponService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCouponDto: UpdateCouponDto) {
    return this.couponService.update(id, updateCouponDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.couponService.remove(id);
  }

  @Post('bulk')
  generateBulk(@Body() dto: GenerateBulkCouponsDto) {
    return this.couponService.generateBulkCoupons(
      dto.count,
      dto.baseProperties,
      dto.prefix,
    );
  }
}
