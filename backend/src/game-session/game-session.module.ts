import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameSessionController } from './game-session.controller';
import { GameSessionService } from './providers/game-session.service';
import { GameSession } from './game-session.entity';
import { Tournament } from '../rounds/entities/tournament.entity';
import { ConfigModule } from '@nestjs/config';
import jwtConfig from '../auth/authConfig/jwt.config';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    // Tournament is the inverse side of GameSession#tournament; TypeORM
    // needs both entities registered for the relation metadata to resolve.
    TypeOrmModule.forFeature([GameSession, Tournament]),
    ConfigModule.forFeature(jwtConfig),
    JwtModule.registerAsync(jwtConfig.asProvider()),
  ],
  controllers: [GameSessionController],
  providers: [GameSessionService],
  exports: [GameSessionService],
})
export class GameSessionModule {}
