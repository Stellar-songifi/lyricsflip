import { forwardRef, Module } from '@nestjs/common';
import { TmpCycleAModule } from './tmp-cycle-a.module';

@Module({
  imports: [forwardRef(() => TmpCycleAModule)],
})
export class TmpCycleBModule {}
