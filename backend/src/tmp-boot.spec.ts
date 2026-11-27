import { Test } from '@nestjs/testing';
import { TmpCycleAModule } from './tmp-cycle-a.module';
import { TmpCycleBModule } from './tmp-cycle-b.module';

describe('tmp cycle', () => {
  it('compiles', async () => {
    const mod = await Test.createTestingModule({
      imports: [TmpCycleAModule, TmpCycleBModule],
    }).compile();
    expect(mod).toBeDefined();
    await mod.close();
  });
});
