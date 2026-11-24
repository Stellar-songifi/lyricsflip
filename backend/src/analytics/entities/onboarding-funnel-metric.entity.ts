import { Column, Entity, PrimaryColumn } from 'typeorm';
import { OnboardingFunnelStep } from '../dto/onboarding-step.dto';

@Entity('onboarding_funnel_metrics')
export class OnboardingFunnelMetric {
  @PrimaryColumn({ type: 'date' })
  day: string;

  @PrimaryColumn({ type: 'varchar', length: 32 })
  step: OnboardingFunnelStep;

  @Column({ type: 'integer', default: 0 })
  count: number;
}
