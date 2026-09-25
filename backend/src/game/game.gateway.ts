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
import { Logger, UseFilters } from '@nestjs/common';
import { WsExceptionFilter } from '../filters/ws-exception.filter';
import { WsAuthenticator } from '../auth/providers/ws-authenticator.provider';

/** `/game` namespace: real-time multiplayer rounds. */

@UseFilters(new WsExceptionFilter())
@WebSocketGateway({
  namespace: 'game',
  pingInterval: 10000,
  pingTimeout: 5000,
  connectTimeout: 45000,
  transports: ['websocket', 'polling'],
})
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('GameGateway');
  private activeGames = new Map();
  private players = new Map();

  constructor(private readonly wsAuthenticator: WsAuthenticator) {}

  afterInit(server: Server) {
    this.logger.log('Game WebSocket Gateway initialized');
  }


  async handleConnection(client: Socket) {
    try {

      this.logger.log(`Client connected: ${client.id}`);
    
      // // Set client options
      client.conn.on('packet', (packet) => {
        // Handle different packet types
        this.logger.debug(`Received packet type: ${packet.type}`);
      });
      // Authenticate client
      const user = await this.wsAuthenticator.authenticate(client);
      client.data.user = user;

      // Add to players list
      this.players.set(client.id, {
        userId: user.sub,
        socket: client,
        gameId: null,
      });

      this.logger.log(`Client connected: ${client.id}`);
    } catch (error) {
      client.disconnect();
      this.logger.error(`Connection error: ${error.message}`);
    }
  }

  handleDisconnect(client: Socket) {

    this.logger.log(`Client disconnected: ${client.id}`);

    // Clean up player data
    const player = this.players.get(client.id);
    if (player && player.gameId) {
      this.handlePlayerLeave(client, player.gameId);
    }
    this.players.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Game Room Management
  @SubscribeMessage('createGame')
  async handleCreateGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameMode: string },
  ) {
    try {
      const gameId = this.generateGameId();
      const player = this.players.get(client.id);

      const game = {
        id: gameId,
        hostId: player.userId,
        players: [player.userId],
        status: 'waiting',
        mode: data.gameMode,
        scores: new Map(),
        startTime: null,
      };

      this.activeGames.set(gameId, game);
      client.join(gameId);
      player.gameId = gameId;

      return { success: true, gameId };
    } catch (error) {
      this.logger.error(`Create game error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('joinGame')
  async handleJoinGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string },
  ) {
    try {
      const game = this.activeGames.get(data.gameId);
      if (!game) {
        throw new Error('Game not found');
      }

      const player = this.players.get(client.id);
      game.players.push(player.userId);
      player.gameId = data.gameId;
      client.join(data.gameId);

      // Notify all players in the game
      this.server.to(data.gameId).emit('playerJoined', {
        playerId: player.userId,
        playerCount: game.players.length,
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`Join game error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Game State Management
  @SubscribeMessage('startGame')
  async handleStartGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string },
  ) {
    try {
      const game = this.activeGames.get(data.gameId);
      if (!game) {
        throw new Error('Game not found');
      }

      const player = this.players.get(client.id);
      if (game.hostId !== player.userId) {
        throw new Error('Only host can start the game');
      }

      game.status = 'playing';
      game.startTime = Date.now();
      this.server.to(data.gameId).emit('gameStarted', {
        startTime: game.startTime,
      });

      // Start first round
      this.startNewRound(data.gameId);
    } catch (error) {
      this.logger.error(`Start game error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('submitAnswer')
  async handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string; answer: string },
  ) {
    try {
      const game = this.activeGames.get(data.gameId);
      if (!game || game.status !== 'playing') {
        throw new Error('Invalid game state');
      }

      const player = this.players.get(client.id);
      // const score = this.calculateScore(data.answer, game.currentRound);
      
      game.scores.set(player.userId, 
        // (game.scores.get(player.userId) || 0) + score
      );

      // Broadcast score update
      this.server.to(data.gameId).emit('scoreUpdate', {
        playerId: player.userId,
        score: game.scores.get(player.userId),
      });

      return { success: true, };
    } catch (error) {
      // this.logger.error(Submit answer error: ${error.message});
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('syncTimer')
  handleSyncTimer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string; remainingMs: number },
  ) {
    const player = this.players.get(client.id);
    if (!player || player.gameId !== data.gameId) {
      return { success: false, error: 'Not in this game' };
    }
    client.to(data.gameId).emit('timerSynced', data);
    return { success: true };
  }

  // Helper Methods
  private generateGameId(): string {
    return Math.random().toString(36).substring(2, 9).toUpperCase();
  }

  private async startNewRound(gameId: string) {
    const game = this.activeGames.get(gameId);
    if (!game) return;

    // Get new question and send to all players
    // const question = await this.getNextQuestion(game.mode);
    game.currentRound = {
      // question,
      startTime: Date.now(),
    };

    this.server.to(gameId).emit('newRound', {
      // question: question.lyrics,
      // options: question.options,
      timeLimit: 20000, // 20 seconds
    });

    // Set timeout for round end
    setTimeout(() => this.endRound(gameId), 20000);
  }

  private async endRound(gameId: string) {
    const game = this.activeGames.get(gameId);
    if (!game) return;

    this.server.to(gameId).emit('roundEnded', {
      scores: Array.from(game.scores.entries()),
      correctAnswer: game.currentRound?.question?.correctAnswer,
    });

    // Start next round or end game
    // Implement round progression logic
  }

  private handlePlayerLeave(client: Socket, gameId: string) {
    const game = this.activeGames.get(gameId);
    if (!game) return;

    const player = this.players.get(client.id);
    game.players = game.players.filter(id => id !== player.userId);

    this.server.to(gameId).emit('playerLeft', {
      playerId: player.userId,
      playerCount: game.players.length,
    });

    // Clean up empty games
    if (game.players.length === 0) {
      this.activeGames.delete(gameId);
    }
  }
}