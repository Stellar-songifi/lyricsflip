import { Module } from '@nestjs/common';
import { StateRecoveryService } from '../../state-recovery/state-recovery.service';

/**
 * Re-exports StateRecoveryService for use inside the IndexerModule.
 * The canonical module lives at src/state-recovery.
 */
@Module({
  providers: [StateRecoveryService],
  exports: [StateRecoveryService],
})
export class StateRecoveryModule {}
