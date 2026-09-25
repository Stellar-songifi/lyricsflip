import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private configService: NestConfigService) {}

  get<T = any>(key: string): T {
    return this.configService.get<T>(key);
  }

  isDevelopment(): boolean {
    return this.get('nodeEnv') === 'development';
  }

  isProduction(): boolean {
    return this.get('nodeEnv') === 'production';
  }

  getPort(): number {
    return this.get<number>('port');
  }

  getDatabaseUrl(): string {
    return this.get<string>('database.url');
  }

  getJwtSecret(): string {
    return this.get<string>('jwt.secret');
  }

  getStellarNetwork(): string {
    return this.get<string>('stellar.network');
  }

  getSorobanRpcUrl(): string {
    return this.get<string>('soroban.rpcUrl');
  }

  getSorobanContractIds(): string[] {
    return this.get<string[]>('soroban.contractIds');
  }

  getCorsOrigin(): string | string[] {
    return this.get<string | string[]>('cors.origin');
  }

  getRedisHost(): string {
    return this.get<string>('redis.host');
  }

  getRedisPort(): number {
    return this.get<number>('redis.port');
  }

  getRateLimitTtl(): number {
    return this.get<number>('rateLimit.ttl');
  }

  getRateLimitLimit(): number {
    return this.get<number>('rateLimit.limit');
  }
}
