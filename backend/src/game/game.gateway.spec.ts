import { Test, TestingModule } from '@nestjs/testing';
import { WsException } from '@nestjs/websockets';
import { GameGateway } from './game.gateway';
import { WsAuthenticator } from '../auth/providers/ws-authenticator.provider';

const mockSocket = (id: string) =>
  ({
    id,
    data: {},
    handshake: { auth: { token: `token-${id}` } },
    conn: { on: jest.fn() },
    join: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    disconnect: jest.fn(),
  }) as any;

describe('GameGateway', () => {
  let gateway: GameGateway;
  const wsAuthenticator = { authenticate: jest.fn() };
  const roomEmit = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [GameGateway, { provide: WsAuthenticator, useValue: wsAuthenticator }],
    }).compile();

    gateway = module.get(GameGateway);
    gateway.server = { to: jest.fn().mockReturnValue({ emit: roomEmit }) } as any;
  });

  it('disconnects sockets that fail authentication', async () => {
    wsAuthenticator.authenticate.mockRejectedValue(new WsException('Invalid access token'));
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

    const created = await gateway.handleCreateGame(host, { gameMode: 'classic' });
    const joined = await gateway.handleJoinGame(guest, { gameId: created.gameId });

    expect(created.success).toBe(true);
    expect(joined).toEqual({ success: true });
    expect(roomEmit).toHaveBeenCalledWith('playerJoined', { playerId: 'guest', playerCount: 2 });
  });

  it('only relays timer syncs from players in the game', async () => {
    wsAuthenticator.authenticate.mockResolvedValue({ sub: 'host' });
    const host = mockSocket('a');
    await gateway.handleConnection(host);
    const { gameId } = await gateway.handleCreateGame(host, { gameMode: 'classic' });

    expect(gateway.handleSyncTimer(host, { gameId, remainingMs: 1000 })).toEqual({ success: true });
    expect(gateway.handleSyncTimer(host, { gameId: 'other', remainingMs: 1000 }).success).toBe(false);
  });
});
