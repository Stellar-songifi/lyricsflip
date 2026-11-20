import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WagerController, RoundWagerController } from './wager.controller';
import { WagerService } from './provider/wager.service';
import { Wager } from './entities/wager.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Wager])],
  controllers: [WagerController, RoundWagerController],
  providers: [WagerService],
  exports: [WagerService],
})
export class WagerModule {}
