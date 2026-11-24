import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Referral } from '../social/entities/referral.entity';
import { ReferralCredit } from './entities/referral-credit.entity';
import { User } from '../user/user.entity';
import { ChainRoundPlayer } from '../indexer/entities/indexer-state.entity';
import { ReferralService } from './referral.service';

/**
 * ReferralModule (LF-355)
 *
 * Owns the referral-reward lifecycle:
 *   - Listens for `referral.signup` to link new wallet users to their referrer.
 *   - Listens for `round.completed` to award the referrer on the referee's
 *     first qualifying multiplayer round.
 *
 * Relies on EventEmitter2 (registered globally in AppModule) so no explicit
 * import of EventEmitterModule is needed here.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Referral,
      ReferralCredit,
      User,
      ChainRoundPlayer,
    ]),
  ],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
