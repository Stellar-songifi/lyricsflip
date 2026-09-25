import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
  } from '@nestjs/websockets';
  import { Server, Socket } from 'socket.io';
  import { OnEvent } from '@nestjs/event-emitter';
  import { Logger } from '@nestjs/common';
  
  @WebSocketGateway({
    namespace: 'rooms',
  })
  export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;
  
    private readonly logger = new Logger(RoomGateway.name);
    private readonly connectedClients = new Map<string, string>(); // socketId -> playerId
  
    handleConnection(client: Socket): void {
      this.logger.log(`Client connected: ${client.id}`);
      
      // Associate socket with player if playerId is provided
      const playerId = client.handshake.query.playerId as string;
      if (playerId) {
        this.connectedClients.set(client.id, playerId);
        client.join(`player:${playerId}`);
        this.logger.log(`Socket ${client.id} associated with player ${playerId}`);
      }
    }
  
    handleDisconnect(client: Socket): void {
      this.logger.log(`Client disconnected: ${client.id}`);
      
      // Clean up player association
      const playerId = this.connectedClients.get(client.id);
      if (playerId) {
        this.connectedClients.delete(client.id);
        this.logger.log(`Socket ${client.id} disassociated from player ${playerId}`);
      }
    }
  
    @OnEvent('player.room.joined')
    handlePlayerJoinedRoom(payload: any): void {
      // Subscribe the player's sockets to the room channel before broadcasting.
      this.server.in(`player:${payload.playerId}`).socketsJoin(`room:${payload.roomId}`);
      this.server.to(`room:${payload.roomId}`).emit('playerJoined', {
        playerId: payload.playerId,
        playerName: payload.playerName,
        timestamp: payload.timestamp,
      });
      
      // Notify the player directly
      this.server.to(`player:${payload.playerId}`).emit('youJoinedRoom', {
        roomId: payload.roomId,
        roomName: payload.roomName,
        timestamp: payload.timestamp,
      });
      
      this.logger.log(`Emitted playerJoined event for player ${payload.playerName} in room ${payload.roomName}`);
    }
  
    @OnEvent('player.room.left')
    handlePlayerLeftRoom(payload: any): void {
      this.server.to(`room:${payload.roomId}`).emit('playerLeft', {
        playerId: payload.playerId,
        playerName: payload.playerName,
        timestamp: payload.timestamp,
      });
      
      // Notify the player directly
      this.server.to(`player:${payload.playerId}`).emit('youLeftRoom', {
        roomId: payload.roomId,
        roomName: payload.roomName,
        timestamp: payload.timestamp,
      });
      
      this.server.in(`player:${payload.playerId}`).socketsLeave(`room:${payload.roomId}`);
      this.logger.log(`Emitted playerLeft event for player ${payload.playerName} from room ${payload.roomName}`);
    }
  }
  