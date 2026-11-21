import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { WS_MAX_HTTP_BUFFER_SIZE } from '../../config/socket-io.config';

/**
 * IndexerGateway broadcasts indexed events to connected clients.
 * 
 * Optionally implements LF-045: WebSocket broadcast of indexed events.
 * Clients subscribe to event streams per round or globally.
 *
 * This gateway is broadcast-only: it exposes no client-triggered handlers,
 * so no WsRateLimitGuard is needed here. It still shares the global
 * Socket.IO configuration (including maxHttpBufferSize) via socket-io.config.
 */
@WebSocketGateway({
  namespace: '/indexer',
  maxHttpBufferSize: WS_MAX_HTTP_BUFFER_SIZE,
})
export class IndexerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(IndexerGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to indexer: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from indexer: ${client.id}`);
  }

  @OnEvent('round.created')
  handleRoundCreated(payload: any) {
    // Broadcast to all connected clients interested in round creation
    this.server.emit('indexer:round:created', {
      roundId: payload.roundId,
      createdAt: payload.createdAt,
    });
  }

  @OnEvent('round.started')
  handleRoundStarted(payload: any) {
    // Broadcast round started event
    this.server.to(`round:${payload.roundId}`).emit('indexer:round:started', {
      roundId: payload.roundId,
      timestamp: payload.timestamp,
    });
  }

  @OnEvent('round.completed')
  handleRoundCompleted(payload: any) {
    // Broadcast round completion with results
    this.server.to(`round:${payload.roundId}`).emit('indexer:round:completed', {
      roundId: payload.roundId,
      results: payload.results,
    });
  }

  @OnEvent('answer.submitted')
  handleAnswerSubmitted(payload: any) {
    // Broadcast answer submission (for spectators)
    this.server.to(`round:${payload.roundId}`).emit('indexer:answer:submitted', {
      playerId: payload.playerId,
      answer: payload.answer,
    });
  }

  @OnEvent('nft.minted')
  handleNftMinted(payload: any) {
    // Broadcast NFT minting achievement
    this.server.to(`player:${payload.playerId}`).emit('indexer:nft:minted', {
      nftId: payload.nftId,
    });
  }
}
