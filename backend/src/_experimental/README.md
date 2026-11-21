# _experimental — Quarantined Modules

**Decision recorded per LF-077 / GitHub issue #494.**

These modules are generic scaffolding unrelated to the LyricsFlip lyric-guessing
game. They were not wired into `AppModule`, and several could not compile due to
missing dependencies or broken imports. They are excluded from the production
TypeScript build via `tsconfig.build.json`.

## Quarantined modules

| Module | Reason |
|---|---|
| `coupons/` | Depends on non-existent `cart`/`orders` modules; not related to gameplay |
| `resource-manager/` | AWS/Kubernetes autoscaling; infrastructure concern out of app scope |
| `voice/` | No module file; incomplete implementation |
| `geolocation/` | MaxMind/GeoIP integration; not required for core gameplay |
| `db-migration/` | Custom migration framework duplicating TypeORM migrations |
| `replay-analysis/` | Generic replay/analytics scaffolding; not wired into AppModule |
| `content-generator/` | Generic content pipeline; not wired into AppModule |
| `config-manager/` | Generic config manager; conflicts with @nestjs/config approach |
| `store/` | Generic store/inventory; not related to the music game |
| `sync/` | Generic offline-sync framework; not wired into AppModule |

## LF-131 — un-quarantined copies removed

LF-077 (#494) intended to *move* these modules here but instead *copied* them,
leaving duplicate directories at `backend/src/<name>` that were still compiled
and produced most of the `tsc` errors. Per LF-131 (#617) the 10 top-level
copies have been deleted; `_experimental/` is now the single source of truth for
these modules.

`ResourceManagerModule` is **not** reinstated: it is infrastructure-only
(AWS/Kubernetes autoscaling), was never wired into `AppModule`, and nothing
outside `_experimental/` imports it. It stays quarantined here.

Importing from `_experimental/` outside of `_experimental/` is now forbidden by
an ESLint `no-restricted-imports` rule in `backend/.eslintrc.js`.

## To reinstate a module

1. Move it back to `backend/src/`.
2. Remove it from the `_experimental` exclusion in `tsconfig.build.json`.
3. Add any required packages to `package.json`.
4. Fix remaining import errors.
5. Wire the module into `AppModule`.
6. Remove the `_experimental` import restriction for that path in
   `backend/.eslintrc.js` if cross-boundary imports are needed.
