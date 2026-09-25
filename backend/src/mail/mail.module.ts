import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import mailConfig from './mail.config';
import { MailService } from './mail.service';

@Module({
  imports: [ConfigModule.forFeature(mailConfig)],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
