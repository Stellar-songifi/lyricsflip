import { Module, forwardRef } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './providers/auth.service';
import { UserModule } from './../user/user.module';
import { SignInProvider } from './providers/sign-in.provider';
import { BcryptProvider } from './providers/bcrypt-provider';
import { GenerateTokensProvider } from './providers/generate-tokens-provider';
import { HashingProvider } from './providers/hashing-provider';
// import { createRoutesFromChildren } from 'react-router-dom';
import { ConfigModule } from '@nestjs/config';
import jwtConfig from './authConfig/jwt.config';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from './guard/access-token/access-token.guard';
import { PasswordResetProvider } from './providers/password-reset.provider';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { MailModule } from '../mail/mail.module';
import { WsAuthenticator } from './providers/ws-authenticator.provider';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SignInProvider,
    {
      provide: HashingProvider, //abstract class
      useClass: BcryptProvider, // implementation
    },
    PasswordResetProvider,
    AccessTokenGuard,
    Reflector, 
    GenerateTokensProvider,
    WsAuthenticator,
  ],
  imports: [
    forwardRef(() => UserModule),
    TypeOrmModule.forFeature([PasswordResetToken]),
    MailModule,
    ConfigModule.forFeature(jwtConfig),
    JwtModule.registerAsync(jwtConfig.asProvider()),
  ],
  exports: [AuthService, HashingProvider, AccessTokenGuard, WsAuthenticator, JwtModule],
})
export class AuthModule {}
