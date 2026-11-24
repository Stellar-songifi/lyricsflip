import { ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsJwtAuthGuard } from './ws-jwt-auth.guard';
import { ActiveUserData } from '../interfaces/active-user-data.interface';

/**
 * Builds a minimal ExecutionContext stub for WS guards.
 *
 * `switchToWs()` must return a `WsArgumentsHost`, which requires three
 * methods: `getClient()`, `getData()`, and `getPattern()`.  Omitting any of
 * them is a TypeScript structural-assignability error when the stub is cast to
 * `ExecutionContext`.  The stubs below supply all three so the spec compiles
 * under a full `tsc --noEmit` as well as under ts-jest's `isolatedModules`.
 */
function buildContext(clientData: Record<string, unknown>): ExecutionContext {
  return {
    switchToWs: () => ({
      getClient: () => ({ data: clientData }),
      getData: () => undefined,
      getPattern: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

describe('WsJwtAuthGuard', () => {
  let guard: WsJwtAuthGuard;

  beforeEach(() => {
    guard = new WsJwtAuthGuard();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('allows a message when the user is set on socket.data', () => {
    const mockUser: ActiveUserData = {
      sub: 'test-user-id',
      email: 'test@example.com',
    };

    const result = guard.canActivate(buildContext({ user: mockUser }));

    expect(result).toBe(true);
  });

  it('rejects when user is absent from socket.data', () => {
    expect(() => guard.canActivate(buildContext({}))).toThrow(WsException);
  });

  it('rejects when socket.data is undefined', () => {
    // Simulate a client that never went through handleConnection.
    const ctx = {
      switchToWs: () => ({
        getClient: () => ({}),   // no .data property at all
        getData: () => undefined,
        getPattern: () => undefined,
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(WsException);
  });

  it('rejects when user is explicitly null', () => {
    expect(() => guard.canActivate(buildContext({ user: null }))).toThrow(
      WsException,
    );
  });

  it('throws WsException with the expected message', () => {
    expect(() => guard.canActivate(buildContext({ user: null }))).toThrow(
      new WsException('Unauthorized: Missing or invalid JWT token'),
    );
  });
});
