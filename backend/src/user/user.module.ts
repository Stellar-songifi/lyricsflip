import { Module, forwardRef } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './providers/user.service';
import { AuthModule } from './../auth/auth.module';
import { FindOneUserByEmailProvider } from './providers/find-one-user-by-email.provider';
import { CreateUserProvider } from './providers/create-user.services';
import { HashingProvider } from './providers/hashing.provider';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import jwtConfig from 'src/auth/authConfig/jwt.config';

@Module({
  controllers: [UserController],
  providers: [
    UserService,
    FindOneUserByEmailProvider,
    CreateUserProvider,
    HashingProvider,
  ],
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => AuthModule),
    ConfigModule.forFeature(jwtConfig),
    JwtModule.registerAsync(jwtConfig.asProvider()),
  ],
  exports: [UserService, FindOneUserByEmailProvider],
})
export class UserModule {}
