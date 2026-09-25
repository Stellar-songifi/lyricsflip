// src/coupons/services/coupon-generator.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon } from '../entities/coupon.entity';
import * as crypto from 'crypto';

@Injectable()
export class CouponGeneratorService {
  private readonly DEFAULT_LENGTH = 8;
  private readonly CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  constructor(
    @InjectRepository(Coupon)
    private couponRepository: Repository<Coupon>,
  ) {}

  generateUniqueCode(prefix?: string, length: number = this.DEFAULT_LENGTH): string {
    let code: string;
    let isUnique = false;

    // Keep generating until we find a unique code
    while (!isUnique) {
      code = this.generateCode(prefix, length);
      
      // Check if code exists in database (would be more efficient as a direct query)
      const existing = this.couponRepository.findOne({ where: { code } });
      
      if (!existing) {
        isUnique = true;
      }
    }

    return code;
  }

  private generateCode(prefix?: string, length: number = this.DEFAULT_LENGTH): string {
    // Calculate actual code length accounting for prefix
    const actualLength = prefix ? Math.max(1, length - prefix.length) : length;
    
    let code = '';
    
    // Simple random generation
    for (let i = 0; i < actualLength; i++) {
      const randomIndex = crypto.randomInt(0, this.CHARACTERS.length);
      code += this.CHARACTERS.charAt(randomIndex);
    }
    
    // Add prefix if provided
    return prefix ? ${prefix}${code} : code;
  }

  async generatePatternedCode(
    pattern: string, 
    replacements: Record<string, string[] | (() => string)> = {}
  ): Promise<string> {
    // Pattern example: "SUMMER-{YEAR}-{RANDOM:4}"
    let code = pattern;
    
    // Replace dynamic parts
    for (const [key, value] of Object.entries(replacements)) {
      const placeholder = {${key}};
      
      if (code.includes(placeholder)) {
        let replacement: string;
        
        if (typeof value === 'function') {
          replacement = value();
        } else if (Array.isArray(value)) {
          const randomIndex = crypto.randomInt(0, value.length);
          replacement = value[randomIndex];
        } else {
          replacement = String(value);
        }
        
        code = code.replace(placeholder, replacement);
      }
    }
    
    // Replace any remaining {RANDOM:n} placeholders
    const randomPattern = /{RANDOM:(\d+)}/g;
    let match;
    
    while ((match = randomPattern.exec(code)) !== null) {
      const length = parseInt(match[1], 10);
      const randomStr = this.generateCode(undefined, length);
      code = code.replace(match[0], randomStr);
    }
    
    return code;
  }
}

