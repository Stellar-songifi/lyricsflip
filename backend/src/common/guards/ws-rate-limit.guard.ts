import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

/**
 * WebSocket message rate-limit guard (LF-350).
 *
 * Applied at the gateway class level (or per-handler) via
 * `@UseGuards(WsRateLimitGuard)`.  Uses an in-process sliding window; limits
 * are intentionally not shared across instances because WebSocket sessions are
 * sticky to a single backend node in the current deployment.
 *
 * Tracker key precedence (most to least specific):
 *   1. Wallet address   (`client.data.user.address`) — set by WsAuthenticator
 *   2. JWT subject      (`client.data.user.sub`)     — set by WsAuthenticator
 *   3. Socket ID        (`client.id`)                — unauthenticated fallback
 *
 * Budget: 60 messages per 10-second window (360 msg/min effective).
 * This is intentionally more generous than the HTTP per-minute limits because
 * WebSocket messages are smaller and more frequent (heartbeats, game events).
 */
@Injectable()
export class WsRateLimitGuard implements CanActivate {
  private readonly windows = new Map<
    string,
    { startedAt: number; count: number }
  >();

  /** Maximum messages allowed within the sliding window. */
  private readonly limit = 60;

  /** Window size in milliseconds. */
  private readonly windowMs = 10_000;

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<{
      id?: string;
      data?: {
        user?: { sub?: string; address?: string };
        address?: string;
        userId?: string;
      };
    }>();

    const key = this.resolveKey(client);
    const now = Date.now();
    const current = this.windows.get(key);

    if (!current || now - current.startedAt >= this.windowMs) {
      this.windows.set(key, { startedAt: now, count: 1 });
      return true;
    }

    current.count += 1;
    if (current.count > this.limit) {
      throw new WsException('Rate limit exceeded');
    }
    return true;
  }

  private resolveKey(client: {
    id?: string;
    data?: {
      user?: { sub?: string; address?: string };
      address?: string;
      userId?: string;
    };
  }): string {
    // Prefer the Stellar wallet address set by WsAuthenticator.
    const address =
      client.data?.user?.address ?? client.data?.address ?? undefined;
    if (address) return `wallet-${address}`;

    // Fall back to the JWT subject (user UUID).
    const sub = client.data?.user?.sub ?? client.data?.userId ?? undefined;
    if (sub) return `user-${sub}`;

    // Last resort: socket connection ID (not stable across reconnects).
    return client.id ?? 'anonymous';
  }
}
