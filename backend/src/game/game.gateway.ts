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
import { WsExceptionFilter } from '../filters/ws-exception.filter';
import { WsAuthenticator } from '../auth/providers/ws-authenticator.provider';
import { WsRateLimitGuard } from '../common/guards/ws-rate-limit.guard';
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
} from './types/realtime';

/**
 * `/game` namespace: Real-Time Multiplayer Protocol (LF-091 / LF-197).
 * Source of truth: docs/realtime-protocol.md
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

  // Active rooms mapped by roomId
  private activeRooms = new Map<string, RoomState>();
  // Active socket connections mapped by socket.id
  private connectedClients = new Map<
    string,
    {
      userId: string;
      socket: Socket;
      roomId: string | null;
      username?: string;
    }
  >();

  constructor(
    private readonly wsAuthenticator: WsAuthenticator,
    private readonly wsRateLimitGuard: WsRateLimitGuard,
  ) {}

  afterInit() {
    this.logger.log('Game WebSocket Gateway initialized on /game');
  }

  async handleConnection(client: Socket) {
    try {
      this.logger.log(`Client connected: ${client.id}`);

      // Authenticate socket client
      const user = await this.wsAuthenticator.authenticate(client);
      client.data.user = user;

      this.connectedClients.set(client.id, {
        userId: user?.sub || client.id,
        socket: client,
        roomId: null,
      });

      this.logger.log(
        `Client authenticated: ${client.id} (user: ${user?.sub})`,
      );
    } catch (error) {
      this.logger.error(
        `Connection auth failed for ${client.id}: ${error.message}`,
      );
      client.emit('error', {
        code: 'UNAUTHORIZED',
        message: error.message || 'Authentication failed',
        timestamp: new Date().toISOString(),
      });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    const clientRecord = this.connectedClients.get(client.id);

    if (clientRecord && clientRecord.roomId) {
      this.performLeaveRoom(client, clientRecord.roomId);
    }

    this.connectedClients.delete(client.id);
  }

  // -------------------------------------------------------------
  // SPEC PROTOCOL MESSAGES (docs/realtime-protocol.md)
  // -------------------------------------------------------------

  @SubscribeMessage('room:join')
  async handleRoomJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: RoomJoinPayload,
  ) {
    try {
      if (!data?.roomId) {
        return { success: false, error: 'roomId is required' };
      }

      const clientRecord = this.connectedClients.get(client.id);
      const playerId = data.playerId || clientRecord?.userId || client.id;
      const username = data.username || data.playerName || playerId;

      let room = this.activeRooms.get(data.roomId);
      if (!room) {
        room = {
          roomId: data.roomId,
          status: 'waiting',
          players: [],
          currentRoundIndex: 0,
          maxRounds: 5,
          createdAt: new Date().toISOString(),
          currentCard: null,
        };
        this.activeRooms.set(data.roomId, room);
      }

      // Add or update player
      const existingPlayerIndex = room.players.findIndex(
        (p) => p.playerId === playerId,
      );
      const playerObj: Player = {
        playerId,
        username,
        id: playerId,
        name: username,
        isReady: false,
        score:
          existingPlayerIndex >= 0
            ? room.players[existingPlayerIndex].score
            : 0,
        joinedAt: new Date().toISOString(),
      };

      if (existingPlayerIndex >= 0) {
        room.players[existingPlayerIndex] = playerObj;
      } else {
        room.players.push(playerObj);
      }

      if (clientRecord) {
        clientRecord.roomId = data.roomId;
        clientRecord.username = username;
      }

      client.join(data.roomId);

      // Broadcast player:joined to all room participants
      const joinPayload: PlayerJoinedPayload = {
        playerId,
        username,
        playerCount: room.players.length,
        timestamp: new Date().toISOString(),
      };
      this.server.to(data.roomId).emit('player:joined', joinPayload);
      // Also emit legacy player_joined / playerJoined
      this.server.to(data.roomId).emit('playerJoined', {
        playerId,
        playerCount: room.players.length,
      });

      return { success: true, roomState: room };
    } catch (error) {
      this.logger.error(`room:join error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('room:leave')
  async handleRoomLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: RoomLeavePayload,
  ) {
    try {
      const roomId = data?.roomId;
      if (!roomId) return { success: false, error: 'roomId is required' };
      this.performLeaveRoom(client, roomId);
      return { success: true };
    } catch (error) {
      this.logger.error(`room:leave error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('room:ready')
  async handleRoomReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: RoomReadyPayload,
  ) {
    try {
      const roomId = data?.roomId;
      const room = this.activeRooms.get(roomId);
      if (!room) return { success: false, error: 'Room not found' };

      const clientRecord = this.connectedClients.get(client.id);
      const playerId = clientRecord?.userId || client.id;

      const player = room.players.find((p) => p.playerId === playerId);
      if (player) {
        player.isReady = true;
      }

      const readyCount = room.players.filter((p) => p.isReady).length;
      const readyPayload: PlayerReadyPayload = {
        playerId,
        readyCount,
        totalPlayers: room.players.length,
      };

      this.server.to(roomId).emit('player:ready', readyPayload);
      return { success: true };
    } catch (error) {
      this.logger.error(`room:ready error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('answer:submitted')
  async handleAnswerSubmitted(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: AnswerSubmittedPayload,
  ) {
    try {
      const roomId = data?.roomId;
      const room = this.activeRooms.get(roomId);
      if (!room) return { success: false, error: 'Room not found' };

      const clientRecord = this.connectedClients.get(client.id);
      const playerId = clientRecord?.userId || client.id;

      const player = room.players.find((p) => p.playerId === playerId);
      if (player) {
        player.score = (player.score || 0) + 10;
      }

      const scorePayload: ScoreUpdatePayload = {
        playerId,
        score: player?.score || 10,
        pointsGained: 10,
        timestamp: new Date().toISOString(),
      };

      this.server.to(roomId).emit('score:update', scorePayload);
      // Legacy score update
      this.server.to(roomId).emit('scoreUpdate', {
        playerId,
        score: player?.score || 10,
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`answer:submitted error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // -------------------------------------------------------------
  // BACKWARDS-COMPATIBLE LEGACY EVENT HANDLERS
  // -------------------------------------------------------------

  @SubscribeMessage('createGame')
  async handleCreateGame(@ConnectedSocket() client: Socket) {
    try {
      const gameId = this.generateGameId();
      const clientRecord = this.connectedClients.get(client.id);
      const userId = clientRecord?.userId || client.id;

      const room: RoomState = {
        roomId: gameId,
        status: 'waiting',
        players: [
          {
            playerId: userId,
            username: userId,
            id: userId,
            name: userId,
            isReady: false,
            score: 0,
            joinedAt: new Date().toISOString(),
          },
        ],
        currentRoundIndex: 0,
        maxRounds: 5,
        createdAt: new Date().toISOString(),
        currentCard: null,
      };

      this.activeRooms.set(gameId, room);
      if (clientRecord) {
        clientRecord.roomId = gameId;
      }
      client.join(gameId);

      return { success: true, gameId };
    } catch (error) {
      this.logger.error(`Create game error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @UseGuards(WsRateLimitGuard)
  @SubscribeMessage('joinGame')
  async handleJoinGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string },
  ) {
    return this.handleRoomJoin(client, { roomId: data.gameId });
  }

  // Game State Management
  @UseGuards(WsRateLimitGuard)
  @SubscribeMessage('startGame')
  async handleStartGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string },
  ) {
    try {
      const room = this.activeRooms.get(data.gameId);
      if (!room) throw new Error('Game not found');

      room.status = 'playing';
      const startTime = Date.now();
      this.server.to(data.gameId).emit('gameStarted', { startTime });

      return { success: true };
    } catch (error) {
      this.logger.error(`Start game error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @UseGuards(WsRateLimitGuard)
  @SubscribeMessage('submitAnswer')
  async handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string; answer: string },
  ) {
    return this.handleAnswerSubmitted(client, {
      roomId: data.gameId,
      answer: data.answer,
    });
  }

  @UseGuards(WsRateLimitGuard)
  @SubscribeMessage('syncTimer')
  handleSyncTimer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string; remainingMs: number },
  ) {
    const clientRecord = this.connectedClients.get(client.id);
    if (!clientRecord || clientRecord.roomId !== data.gameId) {
      return { success: false, error: 'Not in this game' };
    }
    client.to(data.gameId).emit('timerSynced', data);
    return { success: true };
  }

  // -------------------------------------------------------------
  // HELPER METHODS
  // -------------------------------------------------------------

  private performLeaveRoom(client: Socket, roomId: string) {
    const room = this.activeRooms.get(roomId);
    const clientRecord = this.connectedClients.get(client.id);
    const playerId = clientRecord?.userId || client.id;
    const username = clientRecord?.username || playerId;

    if (room) {
      room.players = room.players.filter((p) => p.playerId !== playerId);

      const leavePayload: PlayerLeftPayload = {
        playerId,
        username,
        playerCount: room.players.length,
        timestamp: new Date().toISOString(),
      };
      this.server.to(roomId).emit('player:left', leavePayload);
      this.server.to(roomId).emit('playerLeft', {
        playerId,
        playerCount: room.players.length,
      });

      if (room.players.length === 0) {
        this.activeRooms.delete(roomId);
      }
    }

    if (clientRecord && clientRecord.roomId === roomId) {
      clientRecord.roomId = null;
    }

    client.leave(roomId);
  }

  private generateGameId(): string {
    return Math.random().toString(36).substring(2, 9).toUpperCase();
  }
}
