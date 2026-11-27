import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationModule } from '../../notification/notification.module';
import { ChatRoom } from '../../realtime/entities/chat-room.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChatRoom]), NotificationModule],
  exports: [NotificationModule],
})
export class RealtimeModule {}
