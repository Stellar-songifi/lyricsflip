import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AnalyticsRole } from '../enums/analytics-role.enum';

@Injectable()
export class AnalyticsRolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<AnalyticsRole[]>(
      'roles',
      context.getHandler(),
    );
    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    // Implement your role checking logic here
    const userRole = request.headers['x-analytics-role'];
    return requiredRoles.includes(userRole);
  }
}
