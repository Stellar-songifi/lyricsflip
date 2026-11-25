import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isOriginAllowed, resolveCorsOrigins } from './cors';

const DEFAULT_MAX_HTTP_BUFFER_SIZE = 1e5;

export const WS_MAX_HTTP_BUFFER_SIZE = DEFAULT_MAX_HTTP_BUFFER_SIZE;

export class SocketIOAdapter extends IoAdapter {
  constructor(
    private app: INestApplication,
    private configService: ConfigService,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const corsOrigins = resolveCorsOrigins(
      this.configService.get<string | string[]>('cors.origin'),
      {
        credentials: true,
        nodeEnv:
          this.configService.get<string>('nodeEnv') ?? process.env.NODE_ENV,
      },
    );

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
        origin: (origin, callback) => {
          if (isOriginAllowed(origin, corsOrigins)) {
            callback(null, true);
            return;
          }
          callback(null, false);
        },
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
