import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

/**
 * WebSocket JWT authentication guard. Requires an authenticated user on the
 * WebSocket connection. The `WsAuthenticator` verifies the token during
 * connection handshake and sets the user; this guard enforces that an
 * authenticated user exists for protected message handlers.
 */
@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient();
    if (!client.data?.user) {
      throw new WsException('Unauthorized: Missing or invalid JWT token');
    }
    return true;
  }
}
