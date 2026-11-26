import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';

/** Messages per window allowed per client before the guard rejects. */
const DEFAULT_LIMIT = 60;
/** Window length in seconds. */
const DEFAULT_TTL = 60;

/**
 * WebSocket rate-limit guard. Applies a per-client token-bucket using Redis
 * so limits stay consistent across multiple backend instances.
 *
 * Uses INCR + EXPIRE so the first message in a window sets the TTL and
 * subsequent messages increment atomically.
 */
@Injectable()
export class WsRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(WsRateLimitGuard.name);

  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const clientId = client.id;
    const key = `ws:ratelimit:${clientId}`;

    const count = await this.redisService.incrWithTtl(key, DEFAULT_TTL);

    if (count > DEFAULT_LIMIT) {
      this.logger.warn(`Rate limit exceeded for WS client ${clientId}`);
      throw new WsException('Too many requests');
    }

    return true;
  }
}
