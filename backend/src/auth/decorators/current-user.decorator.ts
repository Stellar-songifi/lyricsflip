import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { REQUEST_USER_KEY } from '../constant/auth-constant';
import { ActiveUserData } from '../interfaces/active-user-data.interface';

/**
 * Returns the verified JWT payload set by `AccessTokenGuard`, or one field of
 * it: `@CurrentUser('sub') userId: string`.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof ActiveUserData | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    const user: ActiveUserData | undefined = request[REQUEST_USER_KEY];
    return field ? user?.[field] : user;
  },
);
