import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomService } from './room.service';
import { RoomMembershipService } from './room-membership.service';
import { PlayerPresenceService } from './player-presence.service';
import { RoomController } from './room.controller';
import { RoomGateway } from './room.gateway';
import { Room } from './entities/room.entity';
import { PlayerRoom } from './entities/player-room.entity';
import { Player } from '../player/player.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Room, PlayerRoom, Player])],
  controllers: [RoomController],
  providers: [RoomService, RoomMembershipService, PlayerPresenceService, RoomGateway],
  exports: [RoomService, RoomMembershipService, PlayerPresenceService],
})
export class RoomModule {}
