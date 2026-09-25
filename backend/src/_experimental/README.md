# _experimental — Quarantined Modules

These folders contain backend modules that were found to be out of scope for the
LyricsFlip lyric-guessing game.  They are **not** imported by `AppModule` and are
**excluded from the TypeScript build** via `tsconfig.build.json`.

## Maintainers' decision (recorded for LF-077)

| Module | Reason excluded | Decision |
|---|---|---|
| `coupons/` | Depends on non-existent `cart/` and `orders/` modules; e-commerce concern | Move to `_experimental/` — revisit if store feature is scoped |
| `resource-manager/` | AWS/Kubernetes autoscaling — infrastructure tooling, not game logic | Move to `_experimental/` — DevOps concern |
| `voice/` | No module file exists; voice-chat is unscoped | Move to `_experimental/` — re-evaluate if voice rooms are added |
| `geolocation/` | MaxMind/GeoIP lookups — regional restrictions not in scope | Move to `_experimental/` — revisit for compliance work |
| `db-migration/` | Custom migration framework duplicating TypeORM migrations | Move to `_experimental/` — TypeORM migrations in `src/migrations/` are canonical |
| `replay-analysis/` | Deep ML-style game replay analysis — unscoped feature | Move to `_experimental/` — possible future analytics feature |
| `content-generator/` | Generic content pipeline — not a game concern | Move to `_experimental/` — may be needed for AI lyric generation later |
| `config-manager/` | Duplicate of `@nestjs/config`; manages runtime config via DB | Move to `_experimental/` — `AppConfigModule` is the canonical config layer |
| `store/` | In-game item store — not yet scoped | Move to `_experimental/` — revisit when wagering / rewards are built out |
| `sync/` | Offline-first sync framework — no mobile client yet | Move to `_experimental/` — revisit when mobile app is integrated |

## How to promote a module back into the build

1. Move the folder back into `backend/src/`.
2. Fix any broken imports (run `npx tsc --noEmit` to find them).
3. Import the module in `AppModule`.
4. Add its HTTP fixtures to `src/http-yac/` and its entries to `backend/README.md`.
5. Open a PR referencing the relevant issue.
