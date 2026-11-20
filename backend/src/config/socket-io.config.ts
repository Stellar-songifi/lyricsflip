import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_MAX_HTTP_BUFFER_SIZE = 1e5;

export class SocketIOAdapter extends IoAdapter {
  constructor(
    private app: INestApplication,
    private configService: ConfigService,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const corsOrigins = this.configService.get<string>('cors.origin') ?? '*';

    const configuredBufferSize = this.configService.get<number>(
      'socket.maxHttpBufferSize',
    );
    const maxHttpBufferSize =
      typeof configuredBufferSize === 'number' && configuredBufferSize > 0
        ? configuredBufferSize
        : DEFAULT_MAX_HTTP_BUFFER_SIZE;

    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: corsOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingInterval: 10000,
      pingTimeout: 5000,
      connectTimeout: 45000,
      maxHttpBufferSize,
      transports: ['websocket', 'polling'],
    });

    return server;
  }
}