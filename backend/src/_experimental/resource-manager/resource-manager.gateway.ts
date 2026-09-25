import { 
    WebSocketGateway, 
    WebSocketServer, 
    SubscribeMessage, 
    OnGatewayConnection, 
    OnGatewayDisconnect 
  } from '@nestjs/websockets';
  import { Logger } from '@nestjs/common';
  import { Server, Socket } from 'socket.io';
  import { OnEvent } from '@nestjs/event-emitter';
  import { ResourceManagerService } from './resource-manager.service';
  
  @WebSocketGateway({
    namespace: '/resource-manager',
  })
  export class ResourceManagerGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;
  
    private readonly logger = new Logger(ResourceManagerGateway.name);
    private statusInterval: NodeJS.Timeout;
    private readonly connectedClients: Set<string> = new Set();
  
    constructor(private resourceManagerService: ResourceManagerService) {
      // Start sending status updates every 10 seconds
      this.startStatusUpdates();
    }
  
    handleConnection(client: Socket) {
      this.logger.log(`Client connected: ${client.id}`);
      this.connectedClients.add(client.id);
      
      // Send initial status
      this.sendSystemStatus(client);
    }
  
    handleDisconnect(client: Socket) {
      this.logger.log(`Client disconnected: ${client.id}`);
      this.connectedClients.delete(client.id);
    }
  
    @SubscribeMessage('getStatus')
    async handleGetStatus(client: Socket) {
      await this.sendSystemStatus(client);
    }
  
    @SubscribeMessage('getUtilization')
    async handleGetUtilization(client: Socket) {
      try {
        const utilization = await this.resourceManagerService.getResourceUtilization();
        client.emit('utilization', utilization);
      } catch (error) {
        this.logger.error(`Error sending utilization: ${error.message}`);
        client.emit('error', { message: 'Failed to get utilization data' });
      }
    }
  
    @OnEvent('alert.triggered')
    handleAlertTriggered(payload: any) {
      this.server.emit('alert', payload);
    }
  
    @OnEvent('scaling.executed')
    handleScalingExecuted(payload: any) {
      this.server.emit('scaling', payload);
    }
  
    private startStatusUpdates() {
      // Clear any existing interval
      if (this.statusInterval) {
        clearInterval(this.statusInterval);
      }
  
      // Set up interval for broadcasting status
      this.statusInterval = setInterval(() => {
        if (this.connectedClients.size > 0) {
          this.broadcastSystemStatus();
        }
      }, 10000); // Every 10 seconds
    }
  
    private async sendSystemStatus(client: Socket) {
      try {
        const status = await this.resourceManagerService.getSystemStatus();
        client.emit('status', status);
      } catch (error) {
        this.logger.error(`Error sending status: ${error.message}`);
        client.emit('error', { message: 'Failed to get system status' });
      }
    }
  
    private async broadcastSystemStatus() {
      try {
        const status = await this.resourceManagerService.getSystemStatus();
        this.server.emit('status', status);
      } catch (error) {
        this.logger.error(`Error broadcasting status: ${error.message}`);
      }
    }
  
    onModuleDestroy() {
      if (this.statusInterval) {
        clearInterval(this.statusInterval);
      }
    }
  }