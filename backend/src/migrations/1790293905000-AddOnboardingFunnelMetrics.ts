import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOnboardingFunnelMetrics1790293905000
  implements MigrationInterface
{
  name = 'AddOnboardingFunnelMetrics1790293905000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "onboarding_funnel_metrics" (
        "day" date NOT NULL,
        "step" character varying(32) NOT NULL,
        "count" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_onboarding_funnel_metrics" PRIMARY KEY ("day", "step"),
        CONSTRAINT "CHK_onboarding_funnel_metrics_count" CHECK ("count" >= 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE "onboarding_funnel_metrics"',
    );
  }
}
