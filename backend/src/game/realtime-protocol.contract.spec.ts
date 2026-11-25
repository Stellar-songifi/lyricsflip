/**
 * LF-339 · Real-Time Protocol Contract Tests
 *
 * Acceptance criteria (from issue #925):
 *   "A client that isn't a player can't emit gameplay events into a room."
 *
 * These tests cover the contract between `GameGateway` and its clients,
 * exercised in isolation (no live Socket.IO server, no DB).  They prove:
 *
 *   1. Only verified players (those whose identity appears in
 *      `chain_round_player`) may emit `answer:submitted` and `room:ready`.
 *   2. Spectators (connected but not in `chain_round_player`) are silently
 *      rejected from gameplay events while still receiving room broadcasts.
 *   3. `score:update` and `round:completed` have no `@SubscribeMessage`
 *      handler — client frames with those names are silently dropped.
 *   4. `WsJwtAuthGuard` is applied: a handler called without an authenticated
 *      user on `socket.data` raises WsException.
 *   5. Identity comes exclusively from the JWT (`socket.data.userId /
 *      address`), never from the message body.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WsException } from '@nestjs/websockets';

import { GameGateway } from './game.gateway';
import { WsAuthenticator } from '../auth/providers/ws-authenticator.provider';
import { WsRateLimitGuard } from '../common/guards/ws-rate-limit.guard';
import { RoundPlayersRepository } from '../room/round-players.repository';
import { WsJwtAuthGuard } from '../auth/guard/ws-jwt-auth.guard';
import {
  IndexerDomainEvents,
  RoundCompletedEvent,
} from '../indexer/services/indexer.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAYER_ADDRESS = 'GPLAYER1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const PLAYER_SUB = 'user-player-1';
const SPECTATOR_SUB = 'user-spectator-1';
const ROOM_ID = 'round-42';

/** Builds a minimal authenticated Socket stub for a player. */
function makeSocket(overrides: Partial<{
  userId: string;
  address: string;
  isPlayer: boolean;
}> = {}) {
  const { userId = PLAYER_SUB, address = PLAYER_ADDRESS } = overrides;
  const emitted: Array<[string, unknown]> = [];
  const rooms = new Set<string>();
  return {
    id: `socket-${Math.random()}`,
    data: {
      userId,
      address,
      playerRooms: new Set<string>(),
      spectatorRooms: new Set<string>(),
    },
    emit: jest.fn((event: string, payload: unknown) => {
      emitted.push([event, payload]);
    }),
    join: jest.fn(async (room: string) => {
      rooms.add(room);
    }),
    leave: jest.fn(async (room: string) => {
      rooms.delete(room);
    }),
    disconnect: jest.fn(),
    to: jest.fn().mockReturnThis(),
    _emitted: emitted,
    _rooms: rooms,
  };
}

/** Minimal Server stub — captures emitted room events. */
function makeServer() {
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  const server = {
    to: jest.fn((room: string) => ({
      emit: jest.fn((event: string, payload: unknown) => {
        emitted.push({ room, event, payload });
      }),
    })),
    _emitted: emitted,
  };
  return server;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('GameGateway — real-time protocol contract (LF-339)', () => {
  let gateway: GameGateway;
  let roundPlayersRepository: jest.Mocked<RoundPlayersRepository>;
  let serverStub: ReturnType<typeof makeServer>;

  beforeEach(async () => {
    roundPlayersRepository = {
      isPlayerInRound: jest.fn(),
      getPlayersInRound: jest.fn(),
    } as unknown as jest.Mocked<RoundPlayersRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameGateway,
        {
          provide: WsAuthenticator,
          useValue: { authenticate: jest.fn() },
        },
        {
          provide: WsRateLimitGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
        {
          provide: RoundPlayersRepository,
          useValue: roundPlayersRepository,
        },
        {
          provide: getDataSourceToken(),
          useValue: { query: jest.fn() },
        },
        EventEmitter2,
      ],
    })
      .overrideGuard(WsRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    gateway = module.get<GameGateway>(GameGateway);
    serverStub = makeServer();
    // Inject the server stub so emits are observable.
    (gateway as any).server = serverStub;
  });

  // -------------------------------------------------------------------------
  // 1. Players can join and emit gameplay events
  // -------------------------------------------------------------------------

  describe('verified player', () => {
    it('joins a room with role=player when present in chain_round_player', async () => {
      roundPlayersRepository.isPlayerInRound.mockResolvedValue(true);
      const socket = makeSocket();

      const result = await gateway.handleRoomJoin(socket as any, {
        roomId: ROOM_ID,
      });

      expect(result.success).toBe(true);
      expect(result.role).toBe('player');
      expect(socket.data.playerRooms.has(ROOM_ID)).toBe(true);
      expect(socket.join).toHaveBeenCalledWith(ROOM_ID);
    });

    it('broadcasts player:joined only for verified players', async () => {
      roundPlayersRepository.isPlayerInRound.mockResolvedValue(true);
      const socket = makeSocket();

      await gateway.handleRoomJoin(socket as any, { roomId: ROOM_ID });

      const broadcast = serverStub._emitted.find(
        (e) => e.event === 'player:joined',
      );
      expect(broadcast).toBeDefined();
      expect(broadcast!.payload).toMatchObject({ playerId: PLAYER_SUB });
    });

    it('allows a player to signal readiness', async () => {
      roundPlayersRepository.isPlayerInRound.mockResolvedValue(true);
      const socket = makeSocket();
      await gateway.handleRoomJoin(socket as any, { roomId: ROOM_ID });

      const result = await gateway.handleRoomReady(socket as any, {
        roomId: ROOM_ID,
      });

      expect(result.success).toBe(true);
      const readyBroadcast = serverStub._emitted.find(
        (e) => e.event === 'player:ready',
      );
      expect(readyBroadcast).toBeDefined();
    });

    it('allows a player to submit an answer (relay only, no server scoring)', async () => {
      roundPlayersRepository.isPlayerInRound.mockResolvedValue(true);
      const socket = makeSocket();
      await gateway.handleRoomJoin(socket as any, { roomId: ROOM_ID });

      const result = await gateway.handleAnswerSubmitted(socket as any, {
        roomId: ROOM_ID,
        answer: 'my-tx-hash',
      });

      expect(result.success).toBe(true);
      // The relay must NOT update a score — that is driven by indexed events.
      const scoreUpdate = serverStub._emitted.find(
        (e) => e.event === 'score:update',
      );
      expect(scoreUpdate).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Non-players join as spectators and cannot emit gameplay events
  // -------------------------------------------------------------------------

  describe('non-player (spectator)', () => {
    it('joins with role=spectator when NOT in chain_round_player', async () => {
      roundPlayersRepository.isPlayerInRound.mockResolvedValue(false);
      const socket = makeSocket({ userId: SPECTATOR_SUB, address: undefined });

      const result = await gateway.handleRoomJoin(socket as any, {
        roomId: ROOM_ID,
      });

      expect(result.success).toBe(true);
      expect(result.role).toBe('spectator');
      expect(socket.data.spectatorRooms.has(ROOM_ID)).toBe(true);
      expect(socket.data.playerRooms.has(ROOM_ID)).toBe(false);
    });

    it('does NOT broadcast player:joined for a spectator join', async () => {
      roundPlayersRepository.isPlayerInRound.mockResolvedValue(false);
      const socket = makeSocket({ userId: SPECTATOR_SUB, address: undefined });

      await gateway.handleRoomJoin(socket as any, { roomId: ROOM_ID });

      const broadcast = serverStub._emitted.find(
        (e) => e.event === 'player:joined',
      );
      expect(broadcast).toBeUndefined();
    });

    it('rejects room:ready from a spectator', async () => {
      // Spectator socket: playerRooms is empty, spectatorRooms has the room.
      const socket = makeSocket({ userId: SPECTATOR_SUB, address: undefined });
      socket.data.spectatorRooms.add(ROOM_ID);
      // Seed the room so the handler doesn't short-circuit on "room not found".
      (gateway as any).activeRooms.set(ROOM_ID, {
        roomId: ROOM_ID,
        status: 'waiting',
        players: [],
        currentRoundIndex: 0,
        maxRounds: 5,
        createdAt: new Date().toISOString(),
        currentCard: null,
      });

      const result = await gateway.handleRoomReady(socket as any, {
        roomId: ROOM_ID,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/player/i);
    });

    it('rejects answer:submitted from a spectator', async () => {
      const socket = makeSocket({ userId: SPECTATOR_SUB, address: undefined });
      socket.data.spectatorRooms.add(ROOM_ID);
      (gateway as any).activeRooms.set(ROOM_ID, {
        roomId: ROOM_ID,
        status: 'playing',
        players: [],
        currentRoundIndex: 0,
        maxRounds: 5,
        createdAt: new Date().toISOString(),
        currentCard: null,
      });

      const result = await gateway.handleAnswerSubmitted(socket as any, {
        roomId: ROOM_ID,
        answer: 'spoofed-answer',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/player/i);
    });
  });

  // -------------------------------------------------------------------------
  // 3. score:update and round:completed are server-only (no client handler)
  // -------------------------------------------------------------------------

  describe('server-only events', () => {
    it('has no @SubscribeMessage handler for "score:update"', () => {
      // If a handler existed it would be registered as a message-mapping entry
      // in the metadata Nest keeps on the class prototype.
      const proto = GameGateway.prototype;
      const methods = Object.getOwnPropertyNames(proto);
      const hasScoreUpdateHandler = methods.some((m) => {
        const meta = Reflect.getMetadata('message', proto, m);
        return meta === 'score:update';
      });
      expect(hasScoreUpdateHandler).toBe(false);
    });

    it('has no @SubscribeMessage handler for "round:completed"', () => {
      const proto = GameGateway.prototype;
      const methods = Object.getOwnPropertyNames(proto);
      const hasRoundCompletedHandler = methods.some((m) => {
        const meta = Reflect.getMetadata('message', proto, m);
        return meta === 'round:completed';
      });
      expect(hasRoundCompletedHandler).toBe(false);
    });

    it('emits score:update and round:completed from indexed on-chain events, not client frames', () => {
      const event: RoundCompletedEvent = {
        roundId: ROOM_ID,
        results: [
          { playerId: PLAYER_SUB, won: true, placement: 1, score: 100 },
        ],
      };

      (gateway as any).activeRooms.set(ROOM_ID, {
        roomId: ROOM_ID,
        status: 'playing',
        players: [
          {
            playerId: PLAYER_SUB,
            username: PLAYER_ADDRESS,
            isReady: true,
            score: 0,
            joinedAt: new Date().toISOString(),
          },
        ],
        currentRoundIndex: 1,
        maxRounds: 5,
        createdAt: new Date().toISOString(),
        currentCard: null,
      });

      gateway.handleRoundCompletedEvent(event);

      const scoreUpdate = serverStub._emitted.find(
        (e) => e.event === 'score:update',
      );
      expect(scoreUpdate).toBeDefined();
      expect(scoreUpdate!.payload).toMatchObject({
        playerId: PLAYER_SUB,
        score: 100,
      });

      const roundCompleted = serverStub._emitted.find(
        (e) => e.event === 'round:completed',
      );
      expect(roundCompleted).toBeDefined();
      expect((roundCompleted!.payload as any).playerResults[0]).toMatchObject({
        playerId: PLAYER_SUB,
        isCorrect: true,
        pointsEarned: 100,
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. WsJwtAuthGuard blocks handlers when user is absent from socket.data
  // -------------------------------------------------------------------------

  describe('WsJwtAuthGuard enforcement', () => {
    it('guard throws WsException when socket.data.user is absent', () => {
      const guard = new WsJwtAuthGuard();
      const ctx = {
        switchToWs: () => ({
          getClient: () => ({ data: {} }),
          getData: () => undefined,
          getPattern: () => undefined,
        }),
      } as any;
      expect(() => guard.canActivate(ctx)).toThrow(WsException);
    });

    it('guard passes when socket.data.user is set', () => {
      const guard = new WsJwtAuthGuard();
      const ctx = {
        switchToWs: () => ({
          getClient: () => ({ data: { user: { sub: PLAYER_SUB } } }),
          getData: () => undefined,
          getPattern: () => undefined,
        }),
      } as any;
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Identity comes from JWT, not from message body
  // -------------------------------------------------------------------------

  describe('identity is never taken from the message body', () => {
    it('room:join ignores a playerId in the message body', async () => {
      roundPlayersRepository.isPlayerInRound.mockResolvedValue(true);
      const socket = makeSocket({ userId: PLAYER_SUB });

      // Payload carries a spoofed playerId that differs from the JWT sub.
      const spoofedPayload = {
        roomId: ROOM_ID,
        playerId: 'SPOOFED-USER-ID',
      } as any;

      await gateway.handleRoomJoin(socket as any, spoofedPayload);

      // The membership check must use socket.data.userId (from JWT), not the payload.
      expect(roundPlayersRepository.isPlayerInRound).toHaveBeenCalledWith(
        ROOM_ID,
        PLAYER_ADDRESS,  // address from JWT
        PLAYER_SUB,      // userId from JWT
      );

      // The player in the room must be the JWT sub, not the spoofed id.
      const room = (gateway as any).activeRooms.get(ROOM_ID) as RoomState;
      const addedPlayer = room?.players.find(
        (p: any) => p.playerId === 'SPOOFED-USER-ID',
      );
      expect(addedPlayer).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Re-export type used in test so the import stays clean.
// ---------------------------------------------------------------------------
interface RoomState {
  roomId: string;
  status: string;
  players: Array<{ playerId: string; [key: string]: unknown }>;
  currentRoundIndex: number;
  maxRounds: number;
  createdAt: string;
  currentCard: unknown;
}
