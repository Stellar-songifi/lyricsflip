import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Global HTTP throttler guard (LF-350).
 *
 * Tracker key precedence (most to least specific):
 *   1. Authenticated wallet address  (`req.user.address`)  — set by WalletAuthProvider
 *   2. Authenticated JWT subject     (`req.user.sub`)      — set by AccessTokenGuard
 *   3. Client IP address             (`req.ip`)            — unauthenticated fallback
 *
 * Using the wallet address (or JWT subject) instead of plain IP means that:
 *   - A single bad actor behind a shared IP (NAT, VPN, university network)
 *     does not exhaust the budget for everyone else.
 *   - An actor who rotates IPs still counts against one limit once
 *     authenticated.
 *
 * The guard is registered as APP_GUARD in AppModule so it applies to every
 * HTTP handler without requiring an explicit @UseGuards() per controller.
 * @Throttle() overrides on individual handlers / controllers still work
 * normally (NestJS picks the most specific metadata: method > class > global).
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const user = req['user'] as
      | { address?: string; sub?: string; id?: string }
      | undefined;

    if (user?.address) {
      // Wallet-authenticated request: key by Stellar address.
      return `wallet-${user.address}`;
    }
    if (user?.sub) {
      // JWT-authenticated request: key by JWT subject (user UUID).
      return `user-${user.sub}`;
    }
    if (user?.id) {
      // Legacy fallback in case some path still sets `id` directly.
      return `user-${user.id}`;
    }
    // Unauthenticated: fall back to IP.
    return req.ip as string;
  }
}
