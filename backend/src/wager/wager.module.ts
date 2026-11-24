import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WagerController, RoundWagerController } from './wager.controller';
import { WagerService } from './provider/wager.service';
import { Wager } from './entities/wager.entity';
// LF-340: nightly reconciliation job + escrow balance reader.
import { WagerReconciliationService } from './services/wager-reconciliation.service';
import { EscrowBalanceService } from './services/escrow-balance.service';

@Module({
  imports: [TypeOrmModule.forFeature([Wager])],
  controllers: [WagerController, RoundWagerController],
  providers: [WagerService, WagerReconciliationService, EscrowBalanceService],
  exports: [WagerService, WagerReconciliationService, EscrowBalanceService],
})
export class WagerModule {}
