import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReferralSystem1709115600000 implements MigrationInterface {
  name = 'CreateReferralSystem1709115600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create referral status enum
    await queryRunner.query(`
      CREATE TYPE "public"."referral_status_enum" AS ENUM ('pending', 'completed', 'expired')
    `);

    // Create referrals table
    await queryRunner.query(`
      CREATE TABLE "referrals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "referral_code" character varying NOT NULL,
        "referrer_id" uuid NOT NULL,
        "referee_id" uuid,
        "status" "public"."referral_status_enum" NOT NULL DEFAULT 'pending',
        "completed_at" TIMESTAMP,
        "reward_details" jsonb,
        "is_reward_distributed" boolean NOT NULL DEFAULT false,
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_referral_code" UNIQUE ("referral_code"),
        CONSTRAINT "PK_referrals" PRIMARY KEY ("id")
      )
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "referrals" 
      ADD CONSTRAINT "FK_referrer" 
      FOREIGN KEY ("referrer_id") 
      REFERENCES "users"("id") 
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "referrals" 
      ADD CONSTRAINT "FK_referee" 
      FOREIGN KEY ("referee_id") 
      REFERENCES "users"("id") 
      ON DELETE SET NULL
    `);

    // Add referral stats column to users table
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "referral_stats" jsonb NOT NULL DEFAULT '{
        "totalReferrals": 0,
        "successfulReferrals": 0,
        "pendingReferrals": 0,
        "totalRewardsEarned": 0
      }'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "referrals" DROP CONSTRAINT "FK_referee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "referrals" DROP CONSTRAINT "FK_referrer"`,
    );

    // Drop referrals table
    await queryRunner.query(`DROP TABLE "referrals"`);

    // Drop enum type
    await queryRunner.query(`DROP TYPE "public"."referral_status_enum"`);

    // Remove referral stats from users table
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "referral_stats"
    `);
  }
}
