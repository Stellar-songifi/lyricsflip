import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class AddIndexerSchema1790293904000 implements MigrationInterface {
  name = 'AddIndexerSchema1790293904000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------------------------------------------------------------
    // indexer_state
    // ---------------------------------------------------------------------
    await queryRunner.createTable(
      new Table({
        name: 'indexer_state',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'contract_id',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'cursor',
            type: 'varchar',
            length: '512',
            isNullable: true,
          },
          {
            name: 'last_ledger',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'indexer_state',
      new TableIndex({
        name: 'IDX_indexer_state_contract_id',
        columnNames: ['contract_id'],
        isUnique: true,
      }),
    );

    // ---------------------------------------------------------------------
    // chain_rounds
    // ---------------------------------------------------------------------
    await queryRunner.createTable(
      new Table({
        name: 'chain_rounds',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'round_id',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'contract_id',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'ledger',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'tx_hash',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'event_index',
            type: 'integer',
            isNullable: false,
            default: 0,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
          {
            name: 'started_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'ended_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'chain_rounds',
      new TableIndex({
        name: 'IDX_chain_rounds_round_id',
        columnNames: ['round_id'],
      }),
    );

    await queryRunner.createIndex(
      'chain_rounds',
      new TableIndex({
        name: 'IDX_chain_rounds_ledger',
        columnNames: ['ledger'],
      }),
    );

    await queryRunner.createIndex(
      'chain_rounds',
      new TableIndex({
        name: 'UQ_chain_rounds_dedup',
        columnNames: ['contract_id', 'tx_hash', 'event_index'],
        isUnique: true,
      }),
    );

    // ---------------------------------------------------------------------
    // chain_round_players
    // ---------------------------------------------------------------------
    await queryRunner.createTable(
      new Table({
        name: 'chain_round_players',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'round_id',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'player',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'contract_id',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'ledger',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'tx_hash',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'event_index',
            type: 'integer',
            isNullable: false,
            default: 0,
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

    await queryRunner.createIndex(
      'chain_round_players',
      new TableIndex({
        name: 'IDX_chain_round_players_player',
        columnNames: ['player'],
      }),
    );

    await queryRunner.createIndex(
      'chain_round_players',
      new TableIndex({
        name: 'IDX_chain_round_players_round_id',
        columnNames: ['round_id'],
      }),
    );

    await queryRunner.createIndex(
      'chain_round_players',
      new TableIndex({
        name: 'IDX_chain_round_players_ledger',
        columnNames: ['ledger'],
      }),
    );

    await queryRunner.createIndex(
      'chain_round_players',
      new TableIndex({
        name: 'UQ_chain_round_players_dedup',
        columnNames: ['contract_id', 'tx_hash', 'event_index'],
        isUnique: true,
      }),
    );

    // ---------------------------------------------------------------------
    // chain_answers
    // ---------------------------------------------------------------------
    await queryRunner.createTable(
      new Table({
        name: 'chain_answers',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'round_id',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'player',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'card_index',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'correct',
            type: 'boolean',
            isNullable: false,
            default: false,
          },
          {
            name: 'points',
            type: 'integer',
            isNullable: false,
            default: 0,
          },
          {
            name: 'ledger',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'tx_hash',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'contract_id',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'event_index',
            type: 'integer',
            isNullable: false,
            default: 0,
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

    await queryRunner.createIndex(
      'chain_answers',
      new TableIndex({
        name: 'IDX_chain_answers_player',
        columnNames: ['player'],
      }),
    );

    await queryRunner.createIndex(
      'chain_answers',
      new TableIndex({
        name: 'IDX_chain_answers_round_id',
        columnNames: ['round_id'],
      }),
    );

    await queryRunner.createIndex(
      'chain_answers',
      new TableIndex({
        name: 'IDX_chain_answers_ledger',
        columnNames: ['ledger'],
      }),
    );

    await queryRunner.createIndex(
      'chain_answers',
      new TableIndex({
        name: 'UQ_chain_answers_dedup',
        columnNames: ['contract_id', 'tx_hash', 'event_index'],
        isUnique: true,
      }),
    );

    // ---------------------------------------------------------------------
    // chain_round_results
    // ---------------------------------------------------------------------
    await queryRunner.createTable(
      new Table({
        name: 'chain_round_results',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'round_id',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'player',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'score',
            type: 'integer',
            isNullable: false,
            default: 0,
          },
          {
            name: 'rank',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'reward',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'ledger',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'tx_hash',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'contract_id',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'event_index',
            type: 'integer',
            isNullable: false,
            default: 0,
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

    await queryRunner.createIndex(
      'chain_round_results',
      new TableIndex({
        name: 'IDX_chain_round_results_player',
        columnNames: ['player'],
      }),
    );

    await queryRunner.createIndex(
      'chain_round_results',
      new TableIndex({
        name: 'IDX_chain_round_results_round_id',
        columnNames: ['round_id'],
      }),
    );

    await queryRunner.createIndex(
      'chain_round_results',
      new TableIndex({
        name: 'IDX_chain_round_results_ledger',
        columnNames: ['ledger'],
      }),
    );

    await queryRunner.createIndex(
      'chain_round_results',
      new TableIndex({
        name: 'UQ_chain_round_results_dedup',
        columnNames: ['contract_id', 'tx_hash', 'event_index'],
        isUnique: true,
      }),
    );

    // ---------------------------------------------------------------------
    // chain_nfts
    // ---------------------------------------------------------------------
    await queryRunner.createTable(
      new Table({
        name: 'chain_nfts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'token_id',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'owner',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'kind',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'contract_id',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'ledger',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'tx_hash',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          {
            name: 'event_index',
            type: 'integer',
            isNullable: false,
            default: 0,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'chain_nfts',
      new TableIndex({
        name: 'IDX_chain_nfts_owner',
        columnNames: ['owner'],
      }),
    );

    await queryRunner.createIndex(
      'chain_nfts',
      new TableIndex({
        name: 'IDX_chain_nfts_ledger',
        columnNames: ['ledger'],
      }),
    );

    await queryRunner.createIndex(
      'chain_nfts',
      new TableIndex({
        name: 'UQ_chain_nfts_token_id',
        columnNames: ['contract_id', 'token_id'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'chain_nfts',
      new TableIndex({
        name: 'UQ_chain_nfts_dedup',
        columnNames: ['contract_id', 'tx_hash', 'event_index'],
        isUnique: true,
      }),
    );

    // ---------------------------------------------------------------------
    // processed_events
    // ---------------------------------------------------------------------
    await queryRunner.createTable(
      new Table({
        name: 'processed_events',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '256',
            isPrimary: true,
          },
          {
            name: 'contract_id',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'ledger',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'processed_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'processed_events',
      new TableIndex({
        name: 'IDX_processed_events_ledger',
        columnNames: ['ledger'],
      }),
    );

    // ---------------------------------------------------------------------
    // Backfill / derive leaderboard_round_results from chain_round_results.
    //
    // LeaderboardService reads from LeaderboardRoundResult. Historically
    // nothing wrote to that table, so the leaderboard was always empty.
    // The indexer now writes ChainRoundResult rows; we derive the
    // leaderboard rows from them here (and the indexer keeps them in sync
    // going forward).
    //
    // Mapping (ChainRoundResult -> LeaderboardRoundResult):
    //   round_id  -> round_id
    //   player    -> player
    //   score     -> score
    //   rank      -> rank
    //   reward    -> reward
    //   ledger    -> ledger
    //   tx_hash   -> tx_hash
    // ---------------------------------------------------------------------
    const hasLeaderboardTable = await queryRunner.hasTable('leaderboard_round_results');
    if (hasLeaderboardTable) {
      await queryRunner.query(`
        INSERT INTO "leaderboard_round_results" (
          "round_id", "player", "score", "rank", "reward", "ledger", "tx_hash"
        )
        SELECT
          crr."round_id",
          crr."player",
          crr."score",
          crr."rank",
          crr."reward",
          crr."ledger",
          crr."tx_hash"
        FROM "chain_round_results" crr
        WHERE NOT EXISTS (
          SELECT 1 FROM "leaderboard_round_results" lrr
          WHERE lrr."round_id" = crr."round_id"
            AND lrr."player" = crr."player"
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes explicitly (some DBs require it before dropping tables).
    const indexDrops: Array<{ table: string; index: string }> = [
      { table: 'processed_events', index: 'IDX_processed_events_ledger' },
      { table: 'chain_nfts', index: 'UQ_chain_nfts_dedup' },
      { table: 'chain_nfts', index: 'UQ_chain_nfts_token_id' },
      { table: 'chain_nfts', index: 'IDX_chain_nfts_ledger' },
      { table: 'chain_nfts', index: 'IDX_chain_nfts_owner' },
      { table: 'chain_round_results', index: 'UQ_chain_round_results_dedup' },
      { table: 'chain_round_results', index: 'IDX_chain_round_results_ledger' },
      { table: 'chain_round_results', index: 'IDX_chain_round_results_round_id' },
      { table: 'chain_round_results', index: 'IDX_chain_round_results_player' },
      { table: 'chain_answers', index: 'UQ_chain_answers_dedup' },
      { table: 'chain_answers', index: 'IDX_chain_answers_ledger' },
      { table: 'chain_answers', index: 'IDX_chain_answers_round_id' },
      { table: 'chain_answers', index: 'IDX_chain_answers_player' },
      { table: 'chain_round_players', index: 'UQ_chain_round_players_dedup' },
      { table: 'chain_round_players', index: 'IDX_chain_round_players_ledger' },
      { table: 'chain_round_players', index: 'IDX_chain_round_players_round_id' },
      { table: 'chain_round_players', index: 'IDX_chain_round_players_player' },
      { table: 'chain_rounds', index: 'UQ_chain_rounds_dedup' },
      { table: 'chain_rounds', index: 'IDX_chain_rounds_ledger' },
      { table: 'chain_rounds', index: 'IDX_chain_rounds_round_id' },
      { table: 'indexer_state', index: 'IDX_indexer_state_contract_id' },
    ];

    for (const { table, index } of indexDrops) {
      if (await queryRunner.hasTable(table)) {
        const tableObj = await queryRunner.getTable(table);
        if (tableObj && tableObj.indices.some((i) => i.name === index)) {
          await queryRunner.dropIndex(table, index);
        }
      }
    }

    // Drop tables in reverse dependency order.
    const tables = [
      'processed_events',
      'chain_nfts',
      'chain_round_results',
      'chain_answers',
      'chain_round_players',
      'chain_rounds',
      'indexer_state',
    ];

    for (const table of tables) {
      if (await queryRunner.hasTable(table)) {
        await queryRunner.dropTable(table, true);
      }
    }
  }
}