import { Module, forwardRef } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './providers/user.service';
import { AuthModule } from './../auth/auth.module';
import { FindOneUserByEmailProvider } from './providers/find-one-user-by-email.provider';
import { CreateUserProvider } from './providers/create-user.services';
import { HashingProvider } from './providers/hashing.provider';
import { AccountDataProvider } from './providers/account-data.provider';
import { UsernameValidatorService } from './providers/username-validator.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Notification } from '../notification/entities/notification.entity';
import { PasswordResetToken } from '../auth/entities/password-reset-token.entity';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import jwtConfig from '@app/auth/authConfig/jwt.config';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';

@Module({
  controllers: [UserController],
  providers: [
    UserService,
    FindOneUserByEmailProvider,
    CreateUserProvider,
    HashingProvider,
    AccountDataProvider,
    UsernameValidatorService,
  ],
  imports: [
    TypeOrmModule.forFeature([User, Notification, PasswordResetToken]),
    forwardRef(() => AuthModule),
    ConfigModule.forFeature(jwtConfig),
    JwtModule.registerAsync(jwtConfig.asProvider()),
    forwardRef(() => LeaderboardModule),
  ],
  exports: [UserService, FindOneUserByEmailProvider],
})
export class UserModule {}
