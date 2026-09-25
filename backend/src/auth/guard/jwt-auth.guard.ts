import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST_USER_KEY } from '../constant/auth-constant';

/**
 * Requires an authenticated user on the request. The global `AccessTokenGuard`
 * verifies the token and sets the user; this guard makes a route reject
 * requests where that did not happen, even if the route is marked `@Public()`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request[REQUEST_USER_KEY]) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
