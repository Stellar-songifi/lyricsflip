import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * LF-343 — Song submission, review, and on-chain publishing workflow.
 *
 * Changes:
 *  1. Extends the `songs_status_enum` with the three new lifecycle values:
 *       submitted  — card proposed by a user or admin, awaiting triage
 *       in_review  — an admin has opened the card for review
 *       rejected   — card refused (bad license, policy violation, etc.)
 *
 *     The existing values ('draft', 'approved', 'on_chain') are kept
 *     unchanged so existing rows are unaffected.
 *
 *  2. Adds `reviewerId` (uuid, nullable) — the user who last reviewed the
 *     card.  Stored as a plain UUID string to avoid a cross-domain FK from
 *     Catalogue to Identity.
 *
 *  3. Adds `rejectionReason` (text, nullable) — mandatory reason recorded
 *     when a card is rejected; null for all other statuses.
 *
 * PostgreSQL does not allow ALTER TYPE … ADD VALUE inside a transaction
 * block, so each ADD VALUE runs outside the implicit transaction by calling
 * queryRunner.query() directly (TypeORM migrations always run inside a
 * transaction by default; we commit it first, then issue the DDL, then
 * re-open for the remaining changes).
 */
export class SongReviewWorkflow1790293905000 implements MigrationInterface {
  name = 'SongReviewWorkflow1790293905000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Commit the open transaction so ALTER TYPE … ADD VALUE is not inside
    // a transaction block (PostgreSQL restriction).
    await queryRunner.query(`COMMIT`);

    await queryRunner.query(
      `ALTER TYPE "public"."songs_status_enum" ADD VALUE IF NOT EXISTS 'submitted'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."songs_status_enum" ADD VALUE IF NOT EXISTS 'in_review'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."songs_status_enum" ADD VALUE IF NOT EXISTS 'rejected'`,
    );

    // Re-open a transaction for the remaining DDL.
    await queryRunner.query(`BEGIN`);

    await queryRunner.query(
      `ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "reviewerId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "rejectionReason" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove the columns added in up().
    await queryRunner.query(
      `ALTER TABLE "songs" DROP COLUMN IF EXISTS "rejectionReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "songs" DROP COLUMN IF EXISTS "reviewerId"`,
    );

    // PostgreSQL does not support removing values from an enum type once
    // added.  To roll back the enum changes the type must be recreated.
    // Rows using the new values must be migrated first.
    await queryRunner.query(`
      UPDATE "songs"
      SET "status" = 'draft'
      WHERE "status" IN ('submitted', 'in_review', 'rejected')
    `);

    await queryRunner.query(`COMMIT`);

    // Recreate the enum without the new values.
    await queryRunner.query(`
      ALTER TYPE "public"."songs_status_enum" RENAME TO "songs_status_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."songs_status_enum"
        AS ENUM('draft', 'approved', 'on_chain')
    `);
    await queryRunner.query(`
      ALTER TABLE "songs"
        ALTER COLUMN "status" TYPE "public"."songs_status_enum"
        USING "status"::text::"public"."songs_status_enum"
    `);
    await queryRunner.query(
      `DROP TYPE "public"."songs_status_enum_old"`,
    );

    await queryRunner.query(`BEGIN`);
  }
}
