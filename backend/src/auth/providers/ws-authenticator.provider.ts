import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import jwtConfig from '../authConfig/jwt.config';
import { ActiveUserData } from '../interfaces/active-user-data.interface';

/**
 * Verifies the access token a socket connects with, taken from
 * `handshake.auth.token` or a `Bearer` authorization header.
 */
@Injectable()
export class WsAuthenticator {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  async authenticate(client: Socket): Promise<ActiveUserData> {
    const [scheme, headerToken] = client.handshake.headers.authorization?.split(' ') ?? [];
    const token =
      client.handshake.auth?.token ?? (scheme === 'Bearer' ? headerToken : undefined);
    if (!token) {
      throw new WsException('Missing access token');
    }
    try {
      return await this.jwtService.verifyAsync<ActiveUserData>(token, this.jwtConfiguration);
    } catch {
      throw new WsException('Invalid access token');
    }
  }
}
