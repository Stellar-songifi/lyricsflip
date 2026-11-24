import { IsBoolean, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationChannel } from '../entities/notification-preference.entity';

export class UpdatePreferenceDto {
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @ApiProperty({ description: 'false to opt out, true to re-enable.' })
  @IsBoolean()
  @IsNotEmpty()
  enabled: boolean;
}
