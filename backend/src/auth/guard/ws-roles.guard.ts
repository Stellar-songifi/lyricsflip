import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';

/**
 * WebSocket role-based authorization guard. Checks if the connected user has
 * the required role(s) for a message handler. Complements `WsJwtAuthGuard` for
 * fine-grained authorization.
 */
@Injectable()
export class WsRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const client = context.switchToWs().getClient();
    const user = client.data?.user;

    if (!user) {
      throw new WsException('Unauthorized: User not found');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new WsException(
        `Forbidden: User role "${user.role}" does not have access. Required roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
