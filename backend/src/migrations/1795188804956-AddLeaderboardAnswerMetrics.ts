import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLeaderboardAnswerMetrics1795188804956 implements MigrationInterface {
  name = 'AddLeaderboardAnswerMetrics1795188804956';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('leaderboard_round_results');
    const columns = [
      new TableColumn({
        name: 'points',
        type: 'integer',
        default: 0,
        isNullable: false,
      }),
      new TableColumn({
        name: 'correctAnswers',
        type: 'integer',
        default: 0,
        isNullable: false,
      }),
      new TableColumn({
        name: 'totalAnswers',
        type: 'integer',
        default: 0,
        isNullable: false,
      }),
    ];

    for (const column of columns) {
      if (!table?.findColumnByName(column.name)) {
        await queryRunner.addColumn('leaderboard_round_results', column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('leaderboard_round_results');
    for (const name of ['totalAnswers', 'correctAnswers', 'points']) {
      if (table?.findColumnByName(name)) {
        await queryRunner.dropColumn('leaderboard_round_results', name);
      }
    }
  }
}
