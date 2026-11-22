import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OnboardingFunnelStep } from '../dto/onboarding-step.dto';

export interface OnboardingFunnelCount {
  day: string;
  step: OnboardingFunnelStep;
  count: number;
}

@Injectable()
export class OnboardingFunnelService {
  constructor(private readonly dataSource: DataSource) {}

  async recordStep(step: OnboardingFunnelStep): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO "onboarding_funnel_metrics" ("day", "step", "count")
       VALUES (CURRENT_DATE, $1, 1)
       ON CONFLICT ("day", "step")
       DO UPDATE SET "count" = "onboarding_funnel_metrics"."count" + 1`,
      [step],
    );
  }

  async getCounts(): Promise<OnboardingFunnelCount[]> {
    return this.dataSource.query(
      `SELECT "day", "step", "count"
       FROM "onboarding_funnel_metrics"
       WHERE "day" >= CURRENT_DATE - INTERVAL '30 days'
       ORDER BY "day" DESC, "step" ASC`,
    );
  }
}
