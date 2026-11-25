import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * LF-341: Enforces case-insensitive username uniqueness by adding a functional
 * unique index on lower(username). The entity already carries
 * `@Index('IDX_users_username_lower', { synchronize: false })` as a placeholder;
 * this migration creates the actual index.
 *
 * Wallet-only accounts are created with a deterministic `wallet_<address>`
 * placeholder name, so no column changes are needed here.
 */
export class AddUsernameLowerIndex1790293907000 implements MigrationInterface {
  name = 'AddUsernameLowerIndex1790293907000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the functional unique index used for case-insensitive uniqueness.
    // The plain UNIQUE constraint on the column remains for the ORM's benefit;
    // this index is what actually prevents case-insensitive collisions.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_username_lower"
      ON "users" (lower("username"))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_username_lower"
    `);
  }
}
