import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ActiveUserData } from '../interfaces/active-user-data.interface';

/**
 * WebSocket param decorator. Returns the verified JWT payload set by
 * `WsAuthenticator` during connection, or one field of it:
 * `@WsCurrentUser('sub') userId: string`.
 * 
 * Usage in WebSocket handlers:
 *   @SubscribeMessage('someEvent')
 *   handleSomething(@WsCurrentUser() user: ActiveUserData) { ... }
 *   
 *   @SubscribeMessage('anotherEvent')
 *   handleAnother(@WsCurrentUser('sub') userId: string) { ... }
 */
export const WsCurrentUser = createParamDecorator(
  (field: keyof ActiveUserData | undefined, context: ExecutionContext) => {
    const client = context.switchToWs().getClient();
    const user: ActiveUserData | undefined = client.data?.user;
    return field ? user?.[field] : user;
  },
);
