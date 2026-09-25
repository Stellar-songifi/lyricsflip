// src/geolocation/services/location-reporting.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { LocationAnalyticsService } from './location-analytics.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'fast-csv';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LocationReportingService {
  private readonly logger = new Logger(LocationReportingService.name);
  private readonly reportsPath: string;

  constructor(
    private locationAnalyticsService: LocationAnalyticsService,
    private configService: ConfigService,
  ) {
    this.reportsPath = this.configService.get('REPORTS_PATH', './reports');
    
    // Ensure reports directory exists
    if (!fs.existsSync(this.reportsPath)) {
      fs.mkdirSync(this.reportsPath, { recursive: true });
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateDailyReport() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    await this.generateReport('daily', { from: yesterday, to: today });
  }

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async generateMonthlyReport() {
    const firstDayOfLastMonth = new Date();
    firstDayOfLastMonth.setDate(1);
    firstDayOfLastMonth.setHours(0, 0, 0, 0);
    firstDayOfLastMonth.setMonth(firstDayOfLastMonth.getMonth() - 1);
    
    const firstDayOfCurrentMonth = new Date();
    firstDayOfCurrentMonth.setDate(1);
    firstDayOfCurrentMonth.setHours(0, 0, 0, 0);
    
    await this.generateReport('monthly', { from: firstDayOfLastMonth, to: firstDayOfCurrentMonth });
  }

  async generateReport(
    type: 'daily' | 'weekly' | 'monthly',
    period: { from: Date; to: Date },
  ): Promise<string> {
    try {
      // Get access stats
      const stats = await this.locationAnalyticsService.getAccessStats(period);
      
      // Get top countries
      const topCountries = await this.locationAnalyticsService.getTopVisitorsPerCountry();
      
      // Get blocked attempts
      const blockedAttempts = await this.locationAnalyticsService.getBlockedAccessAttempts(period);
      
      // Format data for CSV
      const accessData = [
        {
          reportType: type,
          periodStart: period.from.toISOString(),
          periodEnd: period.to.toISOString(),
          totalAccess: stats.total,
          blockedAccess: stats.blocked,
          blockedPercentage: stats.total ? (stats.blocked / stats.total * 100).toFixed(2) : '0',
        },
      ];
      
      const countryData = Object.entries(stats.countries).map(([country, count]) => ({
        country,
        count,
        percentage: stats.total ? (count / stats.total * 100).toFixed(2) : '0',
      }));
      
      const blockedData = blockedAttempts.map(attempt => ({
        timestamp: attempt.accessTime.toISOString(),
        ip: attempt.ipAddress,
        endpoint: attempt.endpoint,
        country: attempt.location?.country || 'Unknown',
        reason: attempt.blockReason || 'Unknown',
      }));
      
      // Generate file names
      const date = new Date().toISOString().split('T')[0];
      const summaryFileName = path.join(this.reportsPath, `${type}_summary_${date}.csv`);
      const countriesFileName = path.join(this.reportsPath, `${type}_countries_${date}.csv`);
      const blockedFileName = path.join(this.reportsPath, `${type}_blocked_${date}.csv`);
      
      // Write CSV files
      await this.writeCSV(summaryFileName, accessData);
      await this.writeCSV(countriesFileName, countryData);
      await this.writeCSV(blockedFileName, blockedData);
      
      this.logger.log(`Generated ${type} report for ${period.from.toISOString()} to ${period.to.toISOString()}`);
      
      return summaryFileName;
    } catch (error) {
      this.logger.error(`Failed to generate ${type} report: ${error.message}`);
      throw error;
    }
  }

  private writeCSV(filename: string, data: any[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(filename);
      csv
        .write(data, { headers: true })
        .pipe(ws)
        .on('finish', resolve)
        .on('error', reject);
    });
  }
}
