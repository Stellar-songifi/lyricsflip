import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsRateLimitGuard implements CanActivate {
  private readonly windows = new Map<
    string,
    { startedAt: number; count: number }
  >();
  private readonly limit = 60;
  private readonly windowMs = 10_000;

  canActivate(context: ExecutionContext): boolean {
    const client = context
      .switchToWs()
      .getClient<{ id?: string; data?: { user?: { sub?: string } } }>();
    const key = client?.data?.user?.sub ?? client?.id ?? 'anonymous';
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
}
