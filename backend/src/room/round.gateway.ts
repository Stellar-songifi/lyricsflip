import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';

import { WsAuthenticator } from '../auth/providers/ws-authenticator.provider';
import { RoundPlayersRepository } from './round-players.repository';
import { IndexerEventNames } from '../indexer/events/indexer-events';
import { WsRateLimitGuard } from '../common/guards/ws-rate-limit.guard';

/**
 * Payload shapes follow docs/realtime-protocol.md.
 */
export interface RoundJoinPayload {
  roundId: number | string;
}

export interface RoundLeavePayload {
  roundId: number | string;
}

export interface RoundReadyPayload {
  roundId: number | string;
}

export interface PlayerJoinedMessage {
  roundId: number;
  player: string;
  joinedAt?: string;
}

export interface AnswerSubmittedMessage {
  roundId: number;
  player: string;
  answerHash?: string;
  submittedAt?: string;
  txHash?: string;
}

export interface RoundCompletedMessage {
  roundId: number;
  winner?: string;
  completedAt?: string;
  txHash?: string;
}

export interface CardNextMessage {
  roundId: number;
  cardId?: number | string;
  startedAt?: string;
}

interface AuthenticatedSocket extends Socket {
  data: {
    userId?: string;
    address?: string;
    rounds?: Set<number>;
  };
}

@WebSocketGateway({
  namespace: '/rounds',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RoundGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RoundGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly authenticator: WsAuthenticator,
    private readonly roundPlayersRepository: RoundPlayersRepository,
  ) {}

  async handleConnection(socket: AuthenticatedSocket): Promise<void> {
    try {
      const identity = await this.authenticator.authenticate(socket);
      socket.data.userId = identity.sub;
      socket.data.address = identity.address;
      socket.data.rounds = new Set<number>();
      this.logger.debug(
        `Socket ${socket.id} connected as ${identity.address ?? identity.sub}`,
      );
    } catch (err) {
      this.logger.warn(
        `Rejecting unauthenticated socket ${socket.id}: ${(err as Error).message}`,
      );
      socket.emit('error', {
        code: 'UNAUTHORIZED',
        message: 'Authentication failed',
      });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: AuthenticatedSocket): Promise<void> {
    const rounds = socket.data?.rounds;
    if (rounds) {
      for (const roundId of rounds) {
        await socket.leave(this.roomName(roundId));
      }
      rounds.clear();
    }
    this.logger.debug(`Socket ${socket.id} disconnected`);
  }

  @SubscribeMessage('room:join')
  @UseGuards(WsRateLimitGuard)
  async handleRoomJoin(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: RoundJoinPayload,
  ): Promise<{ ok: true; roundId: number }> {
    const roundId = this.parseRoundId(payload?.roundId);
    const address = socket.data?.address;
    const userId = socket.data?.userId;

    if (!address && !userId) {
      throw new WsException('UNAUTHORIZED');
    }

    const isPlayer = await this.roundPlayersRepository.isPlayerInRound(
      roundId,
      address,
      userId,
    );

    if (!isPlayer) {
      throw new WsException('FORBIDDEN');
    }

    await socket.join(this.roomName(roundId));
    socket.data.rounds?.add(roundId);

    return { ok: true, roundId };
  }

  @SubscribeMessage('room:leave')
  @UseGuards(WsRateLimitGuard)
  async handleRoomLeave(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: RoundLeavePayload,
  ): Promise<{ ok: true; roundId: number }> {
    const roundId = this.parseRoundId(payload?.roundId);
    await socket.leave(this.roomName(roundId));
    socket.data.rounds?.delete(roundId);
    return { ok: true, roundId };
  }

  @SubscribeMessage('room:ready')
  @UseGuards(WsRateLimitGuard)
  async handleRoomReady(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: RoundReadyPayload,
  ): Promise<{ ok: true; roundId: number }> {
    const roundId = this.parseRoundId(payload?.roundId);
    const rounds = socket.data?.rounds;

    if (!rounds || !rounds.has(roundId)) {
      throw new WsException('NOT_IN_ROOM');
    }

    this.server.to(this.roomName(roundId)).emit('player:ready', {
      roundId,
      player: socket.data.address ?? socket.data.userId,
    });

    return { ok: true, roundId };
  }

  @OnEvent(IndexerEventNames.PlayerJoinedRound)
  handlePlayerJoinedRound(event: {
    roundId: number | string;
    player: string;
    joinedAt?: string;
  }): void {
    const roundId = this.parseRoundId(event.roundId);
    const message: PlayerJoinedMessage = {
      roundId,
      player: event.player,
      joinedAt: event.joinedAt,
    };
    this.server.to(this.roomName(roundId)).emit('player:joined', message);
  }

  @OnEvent(IndexerEventNames.AnswerSubmitted)
  handleAnswerSubmitted(event: {
    roundId: number | string;
    player: string;
    answerHash?: string;
    submittedAt?: string;
    txHash?: string;
  }): void {
    const roundId = this.parseRoundId(event.roundId);
    const message: AnswerSubmittedMessage = {
      roundId,
      player: event.player,
      answerHash: event.answerHash,
      submittedAt: event.submittedAt,
      txHash: event.txHash,
    };
    this.server.to(this.roomName(roundId)).emit('answer:submitted', message);
  }

  @OnEvent(IndexerEventNames.RoundCompleted)
  handleRoundCompleted(event: {
    roundId: number | string;
    winner?: string;
    completedAt?: string;
    txHash?: string;
  }): void {
    const roundId = this.parseRoundId(event.roundId);
    const message: RoundCompletedMessage = {
      roundId,
      winner: event.winner,
      completedAt: event.completedAt,
      txHash: event.txHash,
    };
    this.server.to(this.roomName(roundId)).emit('round:completed', message);
  }

  @OnEvent(IndexerEventNames.RoundStarted)
  handleRoundStarted(event: {
    roundId: number | string;
    cardId?: number | string;
    startedAt?: string;
  }): void {
    const roundId = this.parseRoundId(event.roundId);
    const message: CardNextMessage = {
      roundId,
      cardId: event.cardId,
      startedAt: event.startedAt,
    };
    this.server.to(this.roomName(roundId)).emit('card:next', message);
  }

  private roomName(roundId: number): string {
    return `round:${roundId}`;
  }

  private parseRoundId(value: number | string | undefined): number {
    const roundId = typeof value === 'string' ? Number(value) : value;
    if (!Number.isInteger(roundId) || (roundId as number) <= 0) {
      throw new WsException('INVALID_ROUND_ID');
    }
    return roundId as number;
  }
}
