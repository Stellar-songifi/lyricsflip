import { Test, TestingModule } from '@nestjs/testing';
import { GameGateway } from './game.gateway';
import { WsAuthenticator } from '../auth/providers/ws-authenticator.provider';
import { WsRateLimitGuard } from '../common/guards/ws-rate-limit.guard';
import type {
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PlayerReadyPayload,
  ScoreUpdatePayload,
} from './types/realtime';

const createMockSocket = (id: string, userSub: string) => {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};
  return {
    id,
    data: { user: { sub: userSub } },
    handshake: { auth: { token: `token-${id}` } },
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn((event: string, payload: any) => {
      (listeners[event] || []).forEach((fn) => fn(payload));
    }),
    on: jest.fn((event: string, fn: (...args: any[]) => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    }),
    disconnect: jest.fn(),
  } as any;
};

describe('Realtime Protocol Contract Test (LF-197)', () => {
  let gateway: GameGateway;
  const wsAuthenticator = {
    authenticate: jest.fn().mockImplementation(async (client) => {
      return { sub: client.id === 'client-1' ? 'wallet-alice' : 'wallet-bob' };
    }),
  };

  const broadcastEvents: { room: string; event: string; payload: any }[] = [];

  beforeEach(async () => {
    broadcastEvents.length = 0;
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameGateway,
        { provide: WsAuthenticator, useValue: wsAuthenticator },
        { provide: WsRateLimitGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();

    gateway = module.get<GameGateway>(GameGateway);
    gateway.server = {
      to: jest.fn((roomId: string) => ({
        emit: jest.fn((event: string, payload: any) => {
          broadcastEvents.push({ room: roomId, event, payload });
        }),
      })),
    } as any;
  });

  it('adheres to docs/realtime-protocol.md contract for room:join, room:ready, answer:submitted, and room:leave', async () => {
    const aliceSocket = createMockSocket('client-1', 'wallet-alice');
    const bobSocket = createMockSocket('client-2', 'wallet-bob');

    await gateway.handleConnection(aliceSocket);
    await gateway.handleConnection(bobSocket);

    // 1. Alice joins room
    const aliceJoin = await gateway.handleRoomJoin(aliceSocket, {
      roomId: 'room-contract-1',
      playerId: 'wallet-alice',
      username: 'Alice',
    });

    expect(aliceJoin.success).toBe(true);
    expect(aliceJoin.roomState).toBeDefined();
    expect(aliceJoin.roomState?.roomId).toBe('room-contract-1');
    expect(aliceJoin.roomState?.status).toBe('waiting');
    expect(aliceJoin.roomState?.players).toHaveLength(1);
    expect(aliceJoin.roomState?.players[0]).toEqual(
      expect.objectContaining({
        playerId: 'wallet-alice',
        username: 'Alice',
        isReady: false,
        score: 0,
      }),
    );

    // Verify broadcast event for Alice's join
    const aliceJoinBroadcast = broadcastEvents.find(
      (b) =>
        b.event === 'player:joined' && b.payload.playerId === 'wallet-alice',
    );
    expect(aliceJoinBroadcast).toBeDefined();
    expect(
      (aliceJoinBroadcast?.payload as PlayerJoinedPayload).playerCount,
    ).toBe(1);

    // 2. Bob joins room
    const bobJoin = await gateway.handleRoomJoin(bobSocket, {
      roomId: 'room-contract-1',
      playerId: 'wallet-bob',
      username: 'Bob',
    });

    expect(bobJoin.success).toBe(true);
    expect(bobJoin.roomState?.players).toHaveLength(2);

    const bobJoinBroadcast = broadcastEvents.find(
      (b) => b.event === 'player:joined' && b.payload.playerId === 'wallet-bob',
    );
    expect(bobJoinBroadcast).toBeDefined();
    expect((bobJoinBroadcast?.payload as PlayerJoinedPayload).playerCount).toBe(
      2,
    );

    // 3. Both signal room:ready
    const aliceReady = await gateway.handleRoomReady(aliceSocket, {
      roomId: 'room-contract-1',
    });
    expect(aliceReady.success).toBe(true);

    const aliceReadyBroadcast = broadcastEvents.find(
      (b) =>
        b.event === 'player:ready' && b.payload.playerId === 'wallet-alice',
    );
    expect(aliceReadyBroadcast).toBeDefined();
    expect(
      (aliceReadyBroadcast?.payload as PlayerReadyPayload).readyCount,
    ).toBe(1);
    expect(
      (aliceReadyBroadcast?.payload as PlayerReadyPayload).totalPlayers,
    ).toBe(2);

    // 4. Submit answer
    const answerResult = await gateway.handleAnswerSubmitted(aliceSocket, {
      roomId: 'room-contract-1',
      answer: 'Sweet Child O Mine',
      roundIndex: 1,
    });
    expect(answerResult.success).toBe(true);

    const scoreBroadcast = broadcastEvents.find(
      (b) =>
        b.event === 'score:update' && b.payload.playerId === 'wallet-alice',
    );
    expect(scoreBroadcast).toBeDefined();
    expect((scoreBroadcast?.payload as ScoreUpdatePayload).score).toBe(10);
    expect((scoreBroadcast?.payload as ScoreUpdatePayload).pointsGained).toBe(
      10,
    );

    // 5. Leave room
    const leaveResult = await gateway.handleRoomLeave(bobSocket, {
      roomId: 'room-contract-1',
    });
    expect(leaveResult.success).toBe(true);

    const bobLeaveBroadcast = broadcastEvents.find(
      (b) => b.event === 'player:left' && b.payload.playerId === 'wallet-bob',
    );
    expect(bobLeaveBroadcast).toBeDefined();
    expect((bobLeaveBroadcast?.payload as PlayerLeftPayload).playerCount).toBe(
      1,
    );
  });
});
