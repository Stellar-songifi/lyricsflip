import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adds wallet-based auth support to `users` (see
 * auth/providers/wallet-auth.provider.ts):
 * - `stellarAddress`, the (optional, unique) identifier for
 *   wallet-authenticated accounts - added defensively since `synchronize`
 *   may already have created it in a dev database.
 * - `email`/`password` become optional, since a wallet-only account has
 *   neither.
 */
export class AddWalletLoginToUsers1790293903223 implements MigrationInterface {
  name = 'AddWalletLoginToUsers1790293903223';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    const hasStellarAddress = table?.findColumnByName('stellarAddress');

    if (!hasStellarAddress) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'stellarAddress',
          type: 'varchar',
          length: '56',
          isNullable: true,
          isUnique: true,
        }),
      );
    }

    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL`,
    );

    const table = await queryRunner.getTable('users');
    if (table?.findColumnByName('stellarAddress')) {
      await queryRunner.dropColumn('users', 'stellarAddress');
    }
  }
}
