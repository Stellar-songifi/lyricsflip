import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Player } from '../player/player.entity';
import { PlayerPresenceService } from './player-presence.service';
import { PlayerRoom } from './entities/player-room.entity';
import { Room } from './entities/room.entity';
import { RoomMembershipService } from './room-membership.service';
import { RoomController } from './room.controller';
import { RoomGateway } from './room.gateway';
import { RoomService } from './room.service';
import { RoundGateway } from './round.gateway';
import { RoundPlayersRepository } from './round-players.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([Room, PlayerRoom, Player]),
    // WsAuthenticator (and the JwtService it needs) lives in AuthModule.
    AuthModule,
  ],
  controllers: [RoomController],
  providers: [
    RoomService,
    RoomMembershipService,
    PlayerPresenceService,
    RoomGateway,
    RoundGateway,
    RoundPlayersRepository,
  ],
  exports: [
    RoomService,
    RoomMembershipService,
    PlayerPresenceService,
    RoundGateway,
  ],
})
export class RoomModule {}
