import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseFilters, UseGuards } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WsExceptionFilter } from '../filters/ws-exception.filter';
import { WsAuthenticator } from '../auth/providers/ws-authenticator.provider';
import { WsJwtAuthGuard } from '../auth/guard/ws-jwt-auth.guard';
import { WsRateLimitGuard } from '../common/guards/ws-rate-limit.guard';
import { RoundPlayersRepository } from '../room/round-players.repository';
import {
  IndexerDomainEvents,
  RoundCompletedEvent,
} from '../indexer/services/indexer.service';
import type {
  AnswerSubmittedPayload,
  Player,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PlayerReadyPayload,
  RoomJoinPayload,
  RoomLeavePayload,
  RoomReadyPayload,
  RoomState,
  ScoreUpdatePayload,
  RoundCompletedPayload,
} from './types/realtime';

/**
 * Socket data stored per authenticated connection.
 */
interface AuthenticatedSocketData {
  /** JWT `sub` — DB user id. */
  userId: string;
  /** Stellar wallet address from the JWT `address` claim (wallet-auth users). */
  address?: string;
  /** Rooms (round ids) this socket has joined as a *player*. */
  playerRooms: Set<string>;
  /** Rooms (round ids) this socket has joined as a *spectator*. */
  spectatorRooms: Set<string>;
}

type AuthenticatedSocket = Socket & { data: AuthenticatedSocketData };

/**
 * `/game` namespace — Real-Time Multiplayer Protocol (LF-091 / LF-197 / LF-339).
 * Source of truth: docs/realtime-protocol.md
 *
 * Security model (LF-339):
 *  - Every connection MUST present a valid wallet JWT; unauthenticated sockets
 *    are disconnected immediately in `handleConnection`.
 *  - Every gameplay handler is protected by `WsJwtAuthGuard` so a handler
 *    cannot run if the user object was somehow cleared after connect.
 *  - `room:join` checks `chain_round_player` via the indexer projection.
 *    A socket whose address/userId is in that table joins as a *player* and
 *    may emit gameplay events.  Anyone else joins as a *spectator* and can
 *    only receive broadcasts.
 *  - `score:update` and `round:completed` are **server-only** events driven
 *    by indexed on-chain data.  Client frames with those names are silently
 *    dropped (no `@SubscribeMessage` handler registered).
 *  - Per-socket rate limiting (60 messages / 10 s) is applied at class level.
 */
@UseFilters(new WsExceptionFilter())
@UseGuards(WsRateLimitGuard)
@WebSocketGateway({
  namespace: 'game',
  pingInterval: 10000,
  pingTimeout: 5000,
  connectTimeout: 45000,
  transports: ['websocket', 'polling'],
  cors: {
    origin: true,
    credentials: true,
  },
})
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(GameGateway.name);

  /**
   * In-process room state keyed by roomId.  Used for waiting-room bookkeeping
   * (player list, ready count).  On-chain events are the authoritative source
   * for scoring and completion — the server never derives scores from client
   * submissions.
   */
  private activeRooms = new Map<string, RoomState>();

  constructor(
    private readonly wsAuthenticator: WsAuthenticator,
    private readonly roundPlayersRepository: RoundPlayersRepository,
  ) {}

  afterInit() {
    this.logger.log('Game WebSocket Gateway initialised on /game');
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  async handleConnection(client: Socket) {
    try {
      const user = await this.wsAuthenticator.authenticate(client);

      // Store the validated identity; handlers read from here — never from
      // the message body — to prevent identity spoofing.
      (client as AuthenticatedSocket).data = {
        userId: user.sub,
        address: user.address,
        playerRooms: new Set(),
        spectatorRooms: new Set(),
      };

      this.logger.log(
        `Socket ${client.id} connected as ${user.address ?? user.sub}`,
      );
    } catch (error) {
      this.logger.error(
        `Connection auth failed for ${client.id}: ${(error as Error).message}`,
      );
      client.emit('error', {
        code: 'UNAUTHORIZED',
        message: (error as Error).message || 'Authentication failed',
        timestamp: new Date().toISOString(),
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Socket ${client.id} disconnected`);
    const data = (client as AuthenticatedSocket).data;
    if (!data) return;

    for (const roomId of [...data.playerRooms, ...data.spectatorRooms]) {
      this._performLeaveRoom(client as AuthenticatedSocket, roomId);
    }
  }

  // ---------------------------------------------------------------------------
  // Spec protocol handlers (docs/realtime-protocol.md)
  // ---------------------------------------------------------------------------

  /**
   * `room:join` — the client requests entry to a round room.
   *
   * Membership check (LF-339):
   *  - If the socket's address / userId appears in `chain_round_player` for
   *    this round, they join as a **player** and may emit gameplay events.
   *  - Otherwise they join as a **spectator**: they receive all room broadcasts
   *    but any subsequent gameplay event from them is rejected.
   */
  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('room:join')
  async handleRoomJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: RoomJoinPayload,
  ) {
    if (!data?.roomId) {
      return { success: false, error: 'roomId is required' };
    }

    const roomId = String(data.roomId);
    const { userId, address } = client.data;

    // Check on-chain membership via the indexer projection.
    const isPlayer = await this.roundPlayersRepository.isPlayerInRound(
      roomId,
      address,
      userId,
    );

    const role: 'player' | 'spectator' = isPlayer ? 'player' : 'spectator';

    // Lazily initialise the in-process room state.
    if (!this.activeRooms.has(roomId)) {
      this.activeRooms.set(roomId, {
        roomId,
        status: 'waiting',
        players: [],
        currentRoundIndex: 0,
        maxRounds: 5,
        createdAt: new Date().toISOString(),
        currentCard: null,
      });
    }
    const room = this.activeRooms.get(roomId)!;

    if (isPlayer) {
      // Track the player in the in-process room state.
      const existing = room.players.findIndex((p) => p.playerId === userId);
      const playerObj: Player = {
        playerId: userId,
        username: address ?? userId,
        id: userId,
        name: address ?? userId,
        isReady: false,
        score: existing >= 0 ? room.players[existing].score : 0,
        joinedAt: new Date().toISOString(),
      };
      if (existing >= 0) {
        room.players[existing] = playerObj;
      } else {
        room.players.push(playerObj);
      }

      client.data.playerRooms.add(roomId);
      await client.join(roomId);

      // Broadcast player joined only for verified players.
      const joinPayload: PlayerJoinedPayload = {
        playerId: userId,
        username: address ?? userId,
        playerCount: room.players.length,
        timestamp: new Date().toISOString(),
      };
      this.server.to(roomId).emit('player:joined', joinPayload);
    } else {
      // Spectator: subscribe to room broadcasts but don't appear in player list.
      client.data.spectatorRooms.add(roomId);
      await client.join(roomId);
      this.logger.debug(
        `Socket ${client.id} joined ${roomId} as spectator (not in chain_round_player)`,
      );
    }

    return { success: true, role, roomState: room };
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('room:leave')
  async handleRoomLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: RoomLeavePayload,
  ) {
    const roomId = data?.roomId;
    if (!roomId) return { success: false, error: 'roomId is required' };
    this._performLeaveRoom(client, String(roomId));
    return { success: true };
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('room:ready')
  async handleRoomReady(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: RoomReadyPayload,
  ) {
    const roomId = String(data?.roomId ?? '');

    // Only verified players may signal readiness.
    if (!client.data.playerRooms.has(roomId)) {
      return {
        success: false,
        error: 'You must join this room as a player first',
      };
    }

    const room = this.activeRooms.get(roomId);
    if (!room) return { success: false, error: 'Room not found' };

    const player = room.players.find((p) => p.playerId === client.data.userId);
    if (player) player.isReady = true;

    const readyCount = room.players.filter((p) => p.isReady).length;
    const payload: PlayerReadyPayload = {
      playerId: client.data.userId,
      readyCount,
      totalPlayers: room.players.length,
    };
    this.server.to(roomId).emit('player:ready', payload);
    return { success: true };
  }

  /**
   * `answer:submitted` — the client notifies the server that they submitted an
   * answer on-chain.  The server relays the event to the room for UI updates;
   * actual scoring is derived from indexed on-chain events, NOT from this message.
   *
   * LF-339: only verified players (not spectators) may emit this event.
   */
  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('answer:submitted')
  async handleAnswerSubmitted(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: AnswerSubmittedPayload,
  ) {
    const roomId = String(data?.roomId ?? '');

    // Reject non-player sockets silently (don't leak room membership info).
    if (!client.data.playerRooms.has(roomId)) {
      return { success: false, error: 'Not a player in this room' };
    }

    const room = this.activeRooms.get(roomId);
    if (!room) return { success: false, error: 'Room not found' };

    // Relay the event so other clients can show "player answered" UI.
    // Score is NOT updated here — it comes from indexed on-chain events.
    this.server.to(roomId).emit('answer:submitted', {
      playerId: client.data.userId,
      player: client.data.address ?? client.data.userId,
      roomId,
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Server-only events driven by indexed on-chain data (LF-339)
  //
  // `score:update` and `round:completed` are NEVER handled as inbound client
  // messages.  There is intentionally no @SubscribeMessage for them.  Any
  // client frame with those names is silently dropped by Socket.IO.
  // ---------------------------------------------------------------------------

  /**
   * Emitted by the indexer when a round's results are known on-chain.
   * Broadcasts `round:completed` and `score:update` to the room.
   */
  @OnEvent(IndexerDomainEvents.ROUND_COMPLETED)
  handleRoundCompletedEvent(event: RoundCompletedEvent): void {
    const roomId = String(event.roundId);
    const room = this.activeRooms.get(roomId);

    // Emit score:update for each player result sourced from indexed data.
    for (const result of event.results) {
      const payload: ScoreUpdatePayload = {
        playerId: result.playerId,
        score: result.score ?? 0,
        pointsGained: result.score ?? 0,
        timestamp: new Date().toISOString(),
      };
      this.server.to(roomId).emit('score:update', payload);
    }

    // Emit round:completed with the full result set.
    const completedPayload: RoundCompletedPayload = {
      roundIndex: room?.currentRoundIndex ?? 0,
      correctAnswer: '',
      playerResults: event.results.map((r) => ({
        playerId: r.playerId,
        answer: '',
        isCorrect: r.won,
        pointsEarned: r.score ?? 0,
      })),
      timestamp: new Date().toISOString(),
    };
    this.server.to(roomId).emit('round:completed', completedPayload);

    if (room) room.status = 'completed';
  }

  // ---------------------------------------------------------------------------
  // Backwards-compatible legacy handlers (kept for existing clients)
  // ---------------------------------------------------------------------------

  /**
   * Legacy `joinGame` — delegates to the spec-compliant `room:join`.
   * Identity is taken from the validated JWT, not the message body.
   */
  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('joinGame')
  async handleJoinGame(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { gameId: string },
  ) {
    return this.handleRoomJoin(client, { roomId: data?.gameId });
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('room:sync')
  handleSyncTimer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; remainingMs: number },
  ) {
    const roomId = String(data?.roomId ?? '');
    // Only players in the room may push timer sync hints.
    if (!client.data.playerRooms.has(roomId)) {
      return { success: false, error: 'Not a player in this room' };
    }
    client.to(roomId).emit('timer:tick', {
      roundIndex: this.activeRooms.get(roomId)?.currentRoundIndex ?? 0,
      remainingMs: data.remainingMs,
      timestamp: new Date().toISOString(),
    });
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _performLeaveRoom(
    client: AuthenticatedSocket,
    roomId: string,
  ): void {
    const { userId, address, playerRooms, spectatorRooms } = client.data;
    const wasPlayer = playerRooms.has(roomId);

    playerRooms.delete(roomId);
    spectatorRooms.delete(roomId);

    if (wasPlayer) {
      const room = this.activeRooms.get(roomId);
      if (room) {
        room.players = room.players.filter((p) => p.playerId !== userId);
        const leavePayload: PlayerLeftPayload = {
          playerId: userId,
          username: address ?? userId,
          playerCount: room.players.length,
          timestamp: new Date().toISOString(),
        };
        this.server.to(roomId).emit('player:left', leavePayload);
        if (room.players.length === 0) this.activeRooms.delete(roomId);
      }
    }

    void client.leave(roomId);
  }
}
