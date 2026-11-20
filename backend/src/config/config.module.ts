import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import configuration from './configuration';
import { validationSchema } from './validation.schema';
import { ConfigService } from './providers/config.service';

// Named `AppConfigModule` (not `ConfigModule`) so it doesn't shadow
// `ConfigModule` from `@nestjs/config`, which several other modules import
// directly.
@Module({
  imports: [
    NestConfigModule.forRoot({
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      load: [configuration],
      validationSchema,
      validationOptions: {
        abortEarly: false,
      },
      isGlobal: true,
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class AppConfigModule {}
