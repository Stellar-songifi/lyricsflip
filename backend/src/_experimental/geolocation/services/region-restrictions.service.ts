// src/geolocation/services/region-restrictions.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocationEntity } from '../entities/location.entity';
import { GeolocationService } from './geolocation.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RegionRestrictionsService {
  private readonly logger = new Logger(RegionRestrictionsService.name);
  private restrictedCountries: string[] = [];
  private restrictedRegions: { country: string; regions: string[] }[] = [];

  constructor(
    @InjectRepository(LocationEntity)
    private locationRepository: Repository<LocationEntity>,
    private geolocationService: GeolocationService,
    private configService: ConfigService,
  ) {
    this.loadRestrictions();
  }

  private loadRestrictions() {
    try {
      // Load from config
      const restrictedCountriesStr = this.configService.get('RESTRICTED_COUNTRIES', '');
      if (restrictedCountriesStr) {
        this.restrictedCountries = restrictedCountriesStr.split(',').map(country => country.trim());
      }

      // You could also load from a database or external service
    } catch (error) {
      this.logger.error(`Failed to load region restrictions: ${error.message}`);
    }
  }

  async isRestricted(ip: string): Promise<{ restricted: boolean; reason?: string }> {
    const location = await this.geolocationService.getLocationByIp(ip);
    
    if (!location || !location.countryCode) {
      // If we can't determine the location, default behavior
      const defaultAllow = this.configService.get('DEFAULT_ALLOW_UNKNOWN_LOCATION', 'true') === 'true';
      return {
        restricted: !defaultAllow,
        reason: defaultAllow ? undefined : 'Unknown location',
      };
    }

    // Check country restrictions
    if (this.restrictedCountries.includes(location.countryCode)) {
      return {
        restricted: true,
        reason: `Access from ${location.country} is restricted`,
      };
    }

    // Check region restrictions
    const countryRegionRestriction = this.restrictedRegions.find(
      r => r.country === location.countryCode,
    );
    
    if (countryRegionRestriction && location.region &&
        countryRegionRestriction.regions.includes(location.region)) {
      return {
        restricted: true,
        reason: `Access from ${location.region}, ${location.country} is restricted`,
      };
    }

    // Check if the location itself is marked as restricted
    if (location.isRestricted) {
      return {
        restricted: true,
        reason: 'This IP address is explicitly restricted',
      };
    }

    return { restricted: false };
  }

  async addCountryRestriction(countryCode: string): Promise<void> {
    if (!this.restrictedCountries.includes(countryCode)) {
      this.restrictedCountries.push(countryCode);
      
      // Update all location entries for this country
      await this.locationRepository.update(
        { countryCode },
        { isRestricted: true }
      );
    }
  }

  async removeCountryRestriction(countryCode: string): Promise<void> {
    this.restrictedCountries = this.restrictedCountries.filter(c => c !== countryCode);
    
    // Update all location entries for this country if there are no region-specific restrictions
    const hasRegionRestrictions = this.restrictedRegions.some(r => r.country === countryCode);
    if (!hasRegionRestrictions) {
      await this.locationRepository.update(
        { countryCode },
        { isRestricted: false }
      );
    }
  }

  async addRegionRestriction(countryCode: string, region: string): Promise<void> {
    let countryRegions = this.restrictedRegions.find(r => r.country === countryCode);
    
    if (!countryRegions) {
      countryRegions = { country: countryCode, regions: [] };
      this.restrictedRegions.push(countryRegions);
    }
    
    if (!countryRegions.regions.includes(region)) {
      countryRegions.regions.push(region);
      
      // Update all location entries for this region
      await this.locationRepository.update(
        { countryCode, region },
        { isRestricted: true }
      );
    }
  }

  getRestrictedCountries(): string[] {
    return [...this.restrictedCountries];
  }

  getRestrictedRegions(): { country: string; regions: string[] }[] {
    return JSON.parse(JSON.stringify(this.restrictedRegions));
  }
}
