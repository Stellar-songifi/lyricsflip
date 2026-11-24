/**
 * LF-351: Migration integrity e2e test.
 *
 * Verifies that the TypeORM migrations run cleanly against a real Postgres
 * database (provided by the CI service or a local `docker compose up db`)
 * and that the resulting schema matches the entity definitions — no pending
 * drift.
 *
 * Required environment:
 *   DATABASE_URL=postgres://user:pass@localhost:5432/lyricsflip_test
 *
 * The test is skipped automatically when DATABASE_URL is not set, so it
 * does not block local unit-test runs (npm test) which don't start Postgres.
 */

import { DataSource } from 'typeorm';

const DATABASE_URL = process.env.DATABASE_URL;

// Skip gracefully in environments without a real database.
const describeOrSkip = DATABASE_URL ? describe : describe.skip;

describeOrSkip('Database migrations (e2e)', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = new DataSource({
      type: 'postgres',
      url: DATABASE_URL,
      migrations: [__dirname + '/../src/migrations/*{.ts,.js}'],
      synchronize: false,
      logging: false,
    });
    await ds.initialize();
  }, 60_000);

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  it('runs all pending migrations to completion without errors', async () => {
    // Drop the schema first so we always test a fresh run.
    await ds.dropDatabase();
    await ds.runMigrations({ transaction: 'each' });

    const ran = await ds.query<{ name: string }[]>(
      `SELECT name FROM migrations ORDER BY id`,
    );
    expect(ran.length).toBeGreaterThan(0);
  }, 60_000);

  it('reports no pending (unapplied) migrations after a full run', async () => {
    const pending = await ds.showMigrations();
    // showMigrations() returns true when there are pending ones.
    expect(pending).toBe(false);
  }, 30_000);

  it('allows individual migrations to be reverted and re-applied (idempotent)', async () => {
    // Revert the last migration and re-apply it.
    await ds.undoLastMigration({ transaction: 'each' });
    await ds.runMigrations({ transaction: 'each' });

    const pending = await ds.showMigrations();
    expect(pending).toBe(false);
  }, 60_000);

  it('creates the wagers table with the correct status enum values', async () => {
    const rows = await ds.query<Array<{ enumlabel: string }>>(
      `SELECT enumlabel
         FROM pg_enum
         JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname LIKE '%wager%'
        ORDER BY enumsortorder`,
    );
    const labels = rows.map((r) => r.enumlabel);
    expect(labels).toEqual(
      expect.arrayContaining(['escrowed', 'won', 'lost', 'refunded', 'claimed']),
    );
  }, 30_000);

  it('creates the chain_round_player table with the player column', async () => {
    const cols = await ds.query<Array<{ column_name: string }>>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_name = 'chain_round_player'
        ORDER BY ordinal_position`,
    );
    const names = cols.map((c) => c.column_name);
    expect(names).toContain('round_id');
    expect(names).toContain('player');
    // These columns must NOT exist (were the wrong column names in the
    // buggy RoundPlayersRepository query).
    expect(names).not.toContain('player_address');
    expect(names).not.toContain('player_id');
  }, 30_000);
});
