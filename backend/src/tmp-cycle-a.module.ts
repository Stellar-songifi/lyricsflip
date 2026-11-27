import { forwardRef, Module } from '@nestjs/common';
import { TmpCycleBModule } from './tmp-cycle-b.module';

@Module({
  imports: [forwardRef(() => TmpCycleBModule)],
})
export class TmpCycleAModule {}
