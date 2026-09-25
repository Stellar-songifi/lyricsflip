import { IsEnum, IsNotEmpty } from 'class-validator';
import { PlayerStatus } from '../../player/enums/player-status.enum';

export class UpdatePlayerStatusDto {
  @IsEnum(PlayerStatus)
  @IsNotEmpty()
  status: PlayerStatus;
}
