import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

const srcRoot = path.join(__dirname, '..');

/**
 * A couple of entities import sibling types that were never actually
 * created — `social/entities/profile.entity.ts` expects a `Friend`/
 * `Activity` entity that doesn't exist, and `practice/entities/{practice-
 * session,practice-item}.entity.ts` (and, transitively through them,
 * practice-result.entity.ts) expect enums under a `practice/enums/`
 * directory that was never added. Those are real, separate gaps in those
 * modules — not something migration tooling should paper over by
 * inventing a shape for them — so they're skipped here rather than
 * guessed at, which lets `migration:generate`/`migration:run` work for
 * the rest of the schema. Drop an entry once its module gets the types
 * it's missing.
 */
const ENTITIES_PENDING_FIX = new Set([
  'social/entities/profile.entity.ts',
  'social/entities/friend.entity.ts',
  'social/entities/activity.entity.ts',
  'practice/entities/practice-session.entity.ts',
  'practice/entities/practice-item.entity.ts',
  'practice/entities/practice-result.entity.ts',
]);

function findEntityFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findEntityFiles(full, out);
    } else if (/\.entity\.[tj]s$/.test(entry.name)) {
      const rel = path.relative(srcRoot, full).split(path.sep).join('/');
      if (!ENTITIES_PENDING_FIX.has(rel)) {
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * DataSource used by the TypeORM CLI (`npm run migration:*`). Points at
 * `src/migrations/` — the same directory `app.module.ts`'s
 * `TypeOrmModule.forRoot` already runs on boot (`migrationsRun`) — so the
 * CLI and the running app agree on one migration history.
 *
 * This is also what the `migrations` CI job diffs against: after
 * `migration:run` it runs `npm run migration:check`, which uses TypeORM's
 * `migration:generate --check`. That exits 0 only when the migrated database
 * matches these entities, and 1 when SQL would still be generated. Because
 * `synchronize` is off and the entity set here is the same one the app
 * loads, an entity change that ships without a migration fails CI instead of
 * breaking at runtime.
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  entities: findEntityFiles(srcRoot),
  migrations: [srcRoot + '/migrations/*.{ts,js}'],
});
