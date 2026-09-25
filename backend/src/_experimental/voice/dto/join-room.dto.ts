// src/voice/dto/join-room.dto.ts
import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class JoinRoomDto {
  @IsUUID()
  @IsNotEmpty()
  roomId: string;

  @IsString()
  @IsNotEmpty()
  username: string;
}