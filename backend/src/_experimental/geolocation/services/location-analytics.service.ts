// src/geolocation/services/location-analytics.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { LocationAccessEntity } from '../entities/location-access.entity';
import { LocationEntity } from '../entities/location.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LocationAnalyticsService {
  private readonly logger = new Logger(LocationAnalyticsService.name);
  private readonly enableTracking: boolean;

  constructor(
    @InjectRepository(LocationAccessEntity)
    private locationAccessRepository: Repository<LocationAccessEntity>,
    @InjectRepository(LocationEntity)
    private locationRepository: Repository<LocationEntity>,
    private configService: ConfigService,
  ) {
    this.enableTracking = this.configService.get('ENABLE_LOCATION_TRACKING', 'true') === 'true';
  }

  async trackAccess(data: {
    ipAddress: string;
    userId?: string;
    endpoint: string;
    userAgent?: string;
    isBlocked?: boolean;
    blockReason?: string;
    locationId?: string;
  }): Promise<void> {
    if (!this.enableTracking) {
      return;
    }

    try {
      // Find or create the location reference
      let location: LocationEntity;
      
      if (data.locationId) {
        location = await this.locationRepository.findOne(data.locationId);
      } else {
        location = await this.locationRepository.findOne({ where: { ip: data.ipAddress } });
      }

      const accessRecord = this.locationAccessRepository.create({
        ipAddress: data.ipAddress,
        userId: data.userId,
        endpoint: data.endpoint,
        userAgent: data.userAgent,
        isBlocked: data.isBlocked || false,
        blockReason: data.blockReason,
        location: location || null,
      });

      await this.locationAccessRepository.save(accessRecord);
    } catch (error) {
      this.logger.error(`Failed to track location access: ${error.message}`);
    }
  }

  async getAccessStats(period: {
    from: Date;
    to: Date;
  }): Promise<{ total: number; blocked: number; countries: Record<string, number> }> {
    const accessRecords = await this.locationAccessRepository.find({
      where: {
        accessTime: Between(period.from, period.to),
      },
      relations: ['location'],
    });

    const countries: Record<string, number> = {};
    let blockedCount = 0;

    for (const record of accessRecords) {
      if (record.isBlocked) {
        blockedCount++;
      }

      if (record.location?.countryCode) {
        countries[record.location.countryCode] = (countries[record.location.countryCode] || 0) + 1;
      }
    }

    return {
      total: accessRecords.length,
      blocked: blockedCount,
      countries,
    };
  }

  async getTopVisitorsPerCountry(limit: number = 10): Promise<Array<{ country: string; count: number }>> {
    const result = await this.locationAccessRepository
      .createQueryBuilder('access')
      .leftJoin('access.location', 'location')
      .select('location.countryCode', 'country')
      .addSelect('COUNT(*)', 'count')
      .where('location.countryCode IS NOT NULL')
      .groupBy('location.countryCode')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany();

    return result.map(item => ({
      country: item.country,
      count: parseInt(item.count, 10),
    }));
  }

  async getBlockedAccessAttempts(period: {
    from: Date;
    to: Date;
  }): Promise<LocationAccessEntity[]> {
    return this.locationAccessRepository.find({
      where: {
        isBlocked: true,
        accessTime: Between(period.from, period.to),
      },
      relations: ['location'],
      order: {
        accessTime: 'DESC',
      },
    });
  }
}
