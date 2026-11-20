import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * LF-342 — Round lifecycle notifications.
 *
 * Changes:
 *  1. Adds `title` column (varchar NOT NULL) to the `notifications` table.
 *     Existing rows get a default of 'Notification' so the NOT NULL
 *     constraint is satisfied without touching real data.
 *
 *  2. Creates the `notification_preferences` table for per-user, per-type,
 *     per-channel opt-out settings:
 *       userId   – the user who owns this preference
 *       type     – a NotificationType enum value (varchar)
 *       channel  – 'in_app' | 'email'
 *       enabled  – false = opted out
 *     A unique index on (userId, type, channel) prevents duplicates.
 */
export class NotificationTitleAndPreferences1790293906000
  implements MigrationInterface
{
  name = 'NotificationTitleAndPreferences1790293906000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add title to notifications
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "title" character varying NOT NULL DEFAULT 'Notification'`,
    );
    // Remove the default now that existing rows are populated — new rows
    // must supply an explicit title.
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "title" DROP DEFAULT`,
    );

    // 2. Create notification_preferences
    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "public"."notification_preferences_channel_enum"
        AS ENUM('in_app', 'email')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_preferences" (
        "id"        uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "userId"    character varying NOT NULL,
        "type"      character varying NOT NULL,
        "channel"   "public"."notification_preferences_channel_enum"
                    NOT NULL DEFAULT 'in_app',
        "enabled"   boolean       NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP     NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_preferences" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        "IDX_notification_preferences_user_type_channel"
      ON "notification_preferences" ("userId", "type", "channel")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notification_preferences_user_type_channel"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "notification_preferences"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."notification_preferences_channel_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "title"`,
    );
  }
}
