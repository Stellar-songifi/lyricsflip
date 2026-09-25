import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RoomMembershipDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  playerId: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  roomId: string;
}

export class PlayerIdDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  playerId: string;
}
