import { ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsJwtAuthGuard } from './ws-jwt-auth.guard';
import { ActiveUserData } from '../interfaces/active-user-data.interface';

describe('WsJwtAuthGuard', () => {
  let guard: WsJwtAuthGuard;
  let mockContext: Partial<ExecutionContext>;

  beforeEach(() => {
    guard = new WsJwtAuthGuard();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow connection when user is authenticated', () => {
    const mockUser: ActiveUserData = {
      sub: 'test-user-id',
      email: 'test@example.com',
    };

    const mockClient = {
      data: { user: mockUser },
    };

    mockContext = {
      switchToWs: () => ({
        getClient: () => mockClient,
      }),
    };

    const result = guard.canActivate(mockContext as ExecutionContext);
    expect(result).toBe(true);
  });

  it('should reject connection when user is not authenticated', () => {
    const mockClient = {
      data: {},
    };

    mockContext = {
      switchToWs: () => ({
        getClient: () => mockClient,
      }),
    };

    expect(() => {
      guard.canActivate(mockContext as ExecutionContext);
    }).toThrow(WsException);
  });

  it('should reject connection when client.data is undefined', () => {
    const mockClient = {};

    mockContext = {
      switchToWs: () => ({
        getClient: () => mockClient,
      }),
    };

    expect(() => {
      guard.canActivate(mockContext as ExecutionContext);
    }).toThrow(WsException);
  });

  it('should throw WsException with descriptive message', () => {
    const mockClient = {
      data: { user: null },
    };

    mockContext = {
      switchToWs: () => ({
        getClient: () => mockClient,
      }),
    };

    expect(() => {
      guard.canActivate(mockContext as ExecutionContext);
    }).toThrow(
      new WsException('Unauthorized: Missing or invalid JWT token'),
    );
  });
});
