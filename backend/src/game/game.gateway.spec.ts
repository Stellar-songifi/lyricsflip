import { Test, TestingModule } from '@nestjs/testing';
import { WsException } from '@nestjs/websockets';
import { GameGateway } from './game.gateway';
import { WsAuthenticator } from '../auth/providers/ws-authenticator.provider';
import { WsRateLimitGuard } from '../common/guards/ws-rate-limit.guard';

const mockSocket = (id: string) =>
  ({
    id,
    data: {},
    handshake: { auth: { token: `token-${id}` } },
    conn: { on: jest.fn() },
    join: jest.fn(),
    leave: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    emit: jest.fn(),
    disconnect: jest.fn(),
  }) as any;

describe('GameGateway', () => {
  let gateway: GameGateway;
  const wsAuthenticator = { authenticate: jest.fn() };
  const roomEmit = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameGateway,
        { provide: WsAuthenticator, useValue: wsAuthenticator },
        { provide: WsRateLimitGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();

    gateway = module.get(GameGateway);
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: roomEmit }),
    } as any;
  });

  it('disconnects sockets that fail authentication', async () => {
    wsAuthenticator.authenticate.mockRejectedValue(
      new WsException('Invalid access token'),
    );
    const client = mockSocket('a');

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalled();
  });

  it('lets an authenticated host create a game that another player joins', async () => {
    wsAuthenticator.authenticate
      .mockResolvedValueOnce({ sub: 'host' })
      .mockResolvedValueOnce({ sub: 'guest' });
    const host = mockSocket('a');
    const guest = mockSocket('b');
    await gateway.handleConnection(host);
    await gateway.handleConnection(guest);

    const created = await gateway.handleCreateGame(host, {
      gameMode: 'classic',
    });
    const joined = await gateway.handleJoinGame(guest, {
      gameId: created.gameId,
    });

    expect(created.success).toBe(true);
    expect(joined).toEqual(expect.objectContaining({ success: true }));
    expect(roomEmit).toHaveBeenCalledWith('playerJoined', {
      playerId: 'guest',
      playerCount: 2,
    });
  });

  it('only relays timer syncs from players in the game', async () => {
    wsAuthenticator.authenticate.mockResolvedValue({ sub: 'host' });
    const host = mockSocket('a');
    await gateway.handleConnection(host);
    const { gameId } = await gateway.handleCreateGame(host, {
      gameMode: 'classic',
    });

    expect(
      gateway.handleSyncTimer(host, { gameId, remainingMs: 1000 }),
    ).toEqual({ success: true });
    expect(
      gateway.handleSyncTimer(host, { gameId: 'other', remainingMs: 1000 })
        .success,
    ).toBe(false);
  });

  describe('realtime protocol spec (LF-197)', () => {
    it('handles room:join, emits player:joined and returns roomState', async () => {
      wsAuthenticator.authenticate.mockResolvedValue({ sub: 'player1' });
      const client = mockSocket('s1');
      await gateway.handleConnection(client);

      const result = await gateway.handleRoomJoin(client, {
        roomId: 'room-101',
        playerId: 'player1',
        username: 'Player One',
      });

      expect(result.success).toBe(true);
      expect(result.roomState).toBeDefined();
      expect(result.roomState?.roomId).toBe('room-101');
      expect(result.roomState?.players).toHaveLength(1);
      expect(client.join).toHaveBeenCalledWith('room-101');
      expect(roomEmit).toHaveBeenCalledWith(
        'player:joined',
        expect.objectContaining({
          playerId: 'player1',
          username: 'Player One',
          playerCount: 1,
        }),
      );
    });

    it('handles room:ready and broadcasts player:ready with counts', async () => {
      wsAuthenticator.authenticate.mockResolvedValue({ sub: 'player1' });
      const client = mockSocket('s1');
      await gateway.handleConnection(client);

      await gateway.handleRoomJoin(client, {
        roomId: 'room-102',
        playerId: 'player1',
      });
      const readyResult = await gateway.handleRoomReady(client, {
        roomId: 'room-102',
      });

      expect(readyResult.success).toBe(true);
      expect(roomEmit).toHaveBeenCalledWith(
        'player:ready',
        expect.objectContaining({
          playerId: 'player1',
          readyCount: 1,
          totalPlayers: 1,
        }),
      );
    });

    it('handles answer:submitted and broadcasts score:update', async () => {
      wsAuthenticator.authenticate.mockResolvedValue({ sub: 'player1' });
      const client = mockSocket('s1');
      await gateway.handleConnection(client);

      await gateway.handleRoomJoin(client, {
        roomId: 'room-103',
        playerId: 'player1',
      });
      const ansResult = await gateway.handleAnswerSubmitted(client, {
        roomId: 'room-103',
        answer: 'Option A',
        roundIndex: 1,
      });

      expect(ansResult.success).toBe(true);
      expect(roomEmit).toHaveBeenCalledWith(
        'score:update',
        expect.objectContaining({
          playerId: 'player1',
          score: 10,
          pointsGained: 10,
        }),
      );
    });

    it('handles room:leave and broadcasts player:left', async () => {
      wsAuthenticator.authenticate.mockResolvedValue({ sub: 'player1' });
      const client = mockSocket('s1');
      await gateway.handleConnection(client);

      await gateway.handleRoomJoin(client, {
        roomId: 'room-104',
        playerId: 'player1',
      });
      const leaveResult = await gateway.handleRoomLeave(client, {
        roomId: 'room-104',
      });

      expect(leaveResult.success).toBe(true);
      expect(client.leave).toHaveBeenCalledWith('room-104');
      expect(roomEmit).toHaveBeenCalledWith(
        'player:left',
        expect.objectContaining({
          playerId: 'player1',
          playerCount: 0,
        }),
      );
    });
  });
});
