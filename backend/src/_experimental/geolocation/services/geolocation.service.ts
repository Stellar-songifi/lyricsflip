
// src/geolocation/services/geolocation.service.ts
import { Injectable, Inject, CACHE_MANAGER, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocationEntity } from '../entities/location.entity';
import { LocationDto } from '../dtos/location.dto';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as geoip from 'geoip-lite';
import * as maxmind from 'maxmind';
import { LocationAnalyticsService } from './location-analytics.service';

@Injectable()
export class GeolocationService implements OnModuleInit {
  private readonly logger = new Logger(GeolocationService.name);
  private maxmindReader: any;
  private readonly useExternalApi: boolean;
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(
    @InjectRepository(LocationEntity)
    private locationRepository: Repository<LocationEntity>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private configService: ConfigService,
    private locationAnalyticsService: LocationAnalyticsService,
  ) {
    this.useExternalApi = this.configService.get('USE_EXTERNAL_GEOLOCATION_API', 'false') === 'true';
    this.apiKey = this.configService.get('GEOLOCATION_API_KEY', '');
    this.apiUrl = this.configService.get('GEOLOCATION_API_URL', '');
  }

  async onModuleInit() {
    try {
      // Initialize MaxMind database if configured
      const dbPath = this.configService.get('MAXMIND_DB_PATH');
      if (dbPath) {
        this.maxmindReader = await maxmind.open(dbPath);
        this.logger.log('MaxMind database loaded successfully');
      }
    } catch (error) {
      this.logger.error(`Failed to initialize MaxMind database: ${error.message}`);
    }
  }

  async getLocationByIp(ip: string): Promise<LocationEntity> {
    // Check cache first
    const cachedLocation = await this.cacheManager.get<LocationEntity>(`location:${ip}`);
    if (cachedLocation) {
      return cachedLocation;
    }

    // Check database
    let location = await this.locationRepository.findOne({ where: { ip } });
    if (location) {
      // Store in cache and return
      await this.cacheManager.set(`location:${ip}`, location);
      return location;
    }

    // Lookup location
    const locationData = await this.lookupLocation(ip);
    if (locationData) {
      location = this.locationRepository.create({
        ip,
        ...locationData,
      });
      await this.locationRepository.save(location);
      
      // Store in cache
      await this.cacheManager.set(`location:${ip}`, location);
      return location;
    }

    // Return empty location if lookup failed
    return this.locationRepository.create({ ip });
  }

  private async lookupLocation(ip: string): Promise<Partial<LocationDto>> {
    try {
      // Try MaxMind database first if available
      if (this.maxmindReader) {
        const result = this.maxmindReader.get(ip);
        if (result) {
          return this.formatMaxmindResult(result);
        }
      }

      // Try node-geoip as fallback
      const geoipResult = geoip.lookup(ip);
      if (geoipResult) {
        return this.formatGeoipResult(geoipResult);
      }

      // Use external API as last resort if configured
      if (this.useExternalApi && this.apiKey) {
        return await this.lookupWithExternalApi(ip);
      }

      this.logger.warn(`Could not resolve location for IP: ${ip}`);
      return null;
    } catch (error) {
      this.logger.error(`Error looking up location for IP ${ip}: ${error.message}`);
      return null;
    }
  }

  private formatMaxmindResult(result: any): Partial<LocationDto> {
    return {
      city: result.city?.names?.en,
      region: result.subdivisions?.[0]?.names?.en,
      country: result.country?.names?.en,
      countryCode: result.country?.iso_code,
      latitude: result.location?.latitude,
      longitude: result.location?.longitude,
      timezone: result.location?.time_zone,
      additionalData: {
        accuracy: result.location?.accuracy_radius,
        postalCode: result.postal?.code,
      },
    };
  }

  private formatGeoipResult(result: any): Partial<LocationDto> {
    return {
      city: result.city,
      region: result.region,
      country: result.country,
      countryCode: result.country,
      latitude: result.ll[0],
      longitude: result.ll[1],
      timezone: result.timezone,
      additionalData: {
        postalCode: result.zip,
      },
    };
  }

  private async lookupWithExternalApi(ip: string): Promise<Partial<LocationDto>> {
    try {
      const response = await axios.get(`${this.apiUrl}/${ip}`, {
        params: { apiKey: this.apiKey },
      });
      
      if (response.data) {
        return {
          city: response.data.city,
          region: response.data.region,
          country: response.data.country_name,
          countryCode: response.data.country_code,
          latitude: response.data.latitude,
          longitude: response.data.longitude,
          timezone: response.data.timezone,
          isp: response.data.isp,
          asn: response.data.asn,
          additionalData: {
            organization: response.data.org,
            postalCode: response.data.postal,
          },
        };
      }
    } catch (error) {
      this.logger.error(`External API lookup failed for IP ${ip}: ${error.message}`);
    }
    
    return null;
  }

  async updateLocationData(ip: string, data: Partial<LocationDto>): Promise<LocationEntity> {
    let location = await this.locationRepository.findOne({ where: { ip } });
    
    if (location) {
      this.locationRepository.merge(location, data);
    } else {
      location = this.locationRepository.create({
        ip,
        ...data,
      });
    }
    
    await this.locationRepository.save(location);
    
    // Update cache
    await this.cacheManager.set(`location:${ip}`, location);
    
    return location;
  }

  async invalidateCache(ip: string): Promise<void> {
    await this.cacheManager.del(`location:${ip}`);
  }
}

