// src/geolocation/controllers/geolocation.controller.ts
import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
import { GeolocationService } from '../services/geolocation.service';
import { RegionRestrictionsService } from '../services/region-restrictions.service';
import { LocationAnalyticsService } from '../services/location-analytics.service';
import { LocationReportingService } from '../services/location-reporting.service';
import { LocationDto } from '../dtos/location.dto';
import { JwtAuthGuard } from '../../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Request } from 'express';

@Controller('geolocation')
export class GeolocationController {
  constructor(
    private readonly geolocationService: GeolocationService,
    private readonly regionRestrictionsService: RegionRestrictionsService,
    private readonly locationAnalyticsService: LocationAnalyticsService,
    private readonly locationReportingService: LocationReportingService,
  ) {}

  @Get('lookup')
  async lookupIp(@Query('ip') ip: string, @Req() request: Request) {
    const requestIp = ip || this.getClientIp(request);
    
    // Track this lookup
    await this.locationAnalyticsService.trackAccess({
      ipAddress: requestIp,
      endpoint: '/geolocation/lookup',
      userAgent: request.headers['user-agent'],
    });
    
    const location = await this.geolocationService.getLocationByIp(requestIp);
    
    // Remove sensitive or internal data for public API
    const { isRestricted, additionalData, ...publicData } = location;
    return publicData;
  }

  @Get('check-access')
  async checkAccess(@Query('ip') ip: string, @Req() request: Request) {
    const requestIp = ip || this.getClientIp(request);
    const result = await this.regionRestrictionsService.isRestricted(requestIp);
    
    // Track this check
    await this.locationAnalyticsService.trackAccess({
      ipAddress: requestIp,
      endpoint: '/geolocation/check-access',
      userAgent: request.headers['user-agent'],
      isBlocked: result.restricted,
      blockReason: result.reason,
    });
    
    return result;
  }

  @Get('restricted-regions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  getRestrictedRegions() {
    return {
      countries: this.regionRestrictionsService.getRestrictedCountries(),
      regions: this.regionRestrictionsService.getRestrictedRegions(),
    };
  }

  @Post('restrict-country')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async restrictCountry(@Body() body: { countryCode: string }) {
    await this.regionRestrictionsService.addCountryRestriction(body.countryCode);
    return { success: true };
  }

  @Post('unrestrict-country')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async unrestrictCountry(@Body() body: { countryCode: string }) {
    await this.regionRestrictionsService.removeCountryRestriction(body.countryCode);
    return { success: true };
  }

  @Get('analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getAnalytics(@Query('from') from: string, @Query('to') to: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    
    const stats = await this.locationAnalyticsService.getAccessStats({
      from: fromDate,
      to: toDate,
    });
    
    const topCountries = await this.locationAnalyticsService.getTopVisitorsPerCountry();
    
    return {
      period: { from: fromDate, to: toDate },
      stats,
      topCountries,
    };
  }

  @Get('reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async generateReport(
    @Query('type') type: 'daily' | 'weekly' | 'monthly',
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!type || !['daily', 'weekly', 'monthly'].includes(type)) {
      throw new HttpException('Invalid report type', HttpStatus.BAD_REQUEST);