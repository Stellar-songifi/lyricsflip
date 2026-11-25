import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableColumn,
} from 'typeorm';

/**
 * LF-355: Referral rewards based on verified first rounds.
 *
 * Changes:
 *   1. Add `first_round_id` and `referee_joined_ledger` columns to `referrals`
 *      so the service can record which round triggered a credit and check
 *      account age without re-querying the chain.
 *   2. Create the `referral_credits` audit table: one row per issued reward,
 *      with a unique index that prevents double-issuance and an index on
 *      (referrer_id, credited_at) for the daily-cap count query.
 */
export class AddReferralFirstRoundTracking1790293905000
  implements MigrationInterface
{
  name = 'AddReferralFirstRoundTracking1790293905000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. Extend referrals table
    // ------------------------------------------------------------------
    const referralsTable = await queryRunner.getTable('referrals');

    if (!referralsTable?.findColumnByName('first_round_id')) {
      await queryRunner.addColumn(
        'referrals',
        new TableColumn({
          name: 'first_round_id',
          type: 'varchar',
          length: '128',
          isNullable: true,
        }),
      );
    }

    if (!referralsTable?.findColumnByName('referee_joined_ledger')) {
      await queryRunner.addColumn(
        'referrals',
        new TableColumn({
          name: 'referee_joined_ledger',
          type: 'integer',
          isNullable: true,
        }),
      );
    }

    // Index on first_round_id for fast lookups when checking whether a round
    // has already triggered a credit for a given referee.
    const hasRoundIdx = await queryRunner.hasTable('referrals'); // just checking table exists
    if (hasRoundIdx) {
      await queryRunner
        .createIndex(
          'referrals',
          new TableIndex({
            name: 'IDX_referrals_first_round_id',
            columnNames: ['first_round_id'],
          }),
        )
        .catch(() => {
          /* index may already exist in a dev db with synchronize:true */
        });
    }

    // ------------------------------------------------------------------
    // 2. Create referral_credits audit table
    // ------------------------------------------------------------------
    const hasCredits = await queryRunner.hasTable('referral_credits');
    if (!hasCredits) {
      await queryRunner.createTable(
        new Table({
          name: 'referral_credits',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'uuid_generate_v4()',
            },
            {
              name: 'referrer_id',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'referee_id',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'round_id',
              type: 'varchar',
              length: '128',
              isNullable: false,
            },
            {
              name: 'points_awarded',
              type: 'integer',
              isNullable: false,
            },
            {
              name: 'credited_at',
              type: 'timestamptz',
              isNullable: false,
            },
            {
              name: 'created_at',
              type: 'timestamptz',
              default: 'now()',
              isNullable: false,
            },
          ],
        }),
        true,
      );

      // Unique: prevent double-issuing if the event replays.
      await queryRunner.createIndex(
        'referral_credits',
        new TableIndex({
          name: 'IDX_referral_credits_referrer_referee_round',
          columnNames: ['referrer_id', 'referee_id', 'round_id'],
          isUnique: true,
        }),
      );

      // Composite for the daily-cap count query.
      await queryRunner.createIndex(
        'referral_credits',
        new TableIndex({
          name: 'IDX_referral_credits_referrer_day',
          columnNames: ['referrer_id', 'credited_at'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop referral_credits
    const hasCredits = await queryRunner.hasTable('referral_credits');
    if (hasCredits) {
      await queryRunner.dropIndex(
        'referral_credits',
        'IDX_referral_credits_referrer_day',
      );
      await queryRunner.dropIndex(
        'referral_credits',
        'IDX_referral_credits_referrer_referee_round',
      );
      await queryRunner.dropTable('referral_credits');
    }

    // Remove added columns from referrals
    const referralsTable = await queryRunner.getTable('referrals');
    if (referralsTable?.findColumnByName('referee_joined_ledger')) {
      await queryRunner.dropColumn('referrals', 'referee_joined_ledger');
    }
    if (referralsTable?.findColumnByName('first_round_id')) {
      await queryRunner
        .dropIndex('referrals', 'IDX_referrals_first_round_id')
        .catch(() => {});
      await queryRunner.dropColumn('referrals', 'first_round_id');
    }
  }
}
