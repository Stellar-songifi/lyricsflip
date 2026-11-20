# LyricsFlip Backend

NestJS API and WebSocket server for **LyricsFlip**, a lyrics-guessing game with on-chain wagers and rewards on Stellar/Soroban. It handles auth, players, songs and questions, game sessions (single-player and real-time multiplayer), scoring, leaderboards, and indexing of contract events.

## Module map

`AppModule` imports exactly seven public domain modules from `src/domains/`.
Each domain is the sole owner of its tables, HTTP prefixes and WebSocket
namespaces; folders inside a domain are implementation details. The full
inventory, including deprecated aliases and removed modules, is in
[`docs/architecture.md`](../docs/architecture.md#backend-module-map-lf-348).

| Domain | Public module | Owns | HTTP | WebSocket namespace |
| --- | --- | --- | --- | --- |
| Identity | `IdentityModule` | Auth, `User`, `Player`, session tokens | `/auth`, `/user` | — |
| Catalogue | `CatalogueModule` | `Song`, `Tag`, `UserGenrePreference`, `Question` | `/songs`, `/questions` | — |
| Rounds (chain mirror) | `RoundsModule` | Game modes, sessions, results, scoring, wagers, rooms, all chain entities | `/rounds`, `/game-modes`, `/game-results`, `/wagers`, `/scoring`; legacy `/game-session`, `/quick-game/rounds`, `/rooms` | `/game`, `/rooms`, `/indexer`; `/rounds` relay |
| Realtime | `RealtimeModule` | `Notification`, chat rooms | `/notifications` | `/notifications` |
| Social | `SocialModule` | Profiles, friends, activity, challenges, referrals, leaderboards | `/players`, `/leaderboard`, `/profile`, `/friends`, `/activity`, `/challenge`, `/referrals` | — |
| Rewards | `RewardsModule` | Achievements and progression | `/rewards`, `/achievements`, `/progression`; legacy `/reward` | — |
| Admin | `AdminModule` | Analytics metrics and song curation | `/analytics`, `/admin/songs` | — |

Rules of thumb:

- `src/domains/domain-map.ts` is the ownership manifest. Add a folder or route to
  exactly one domain; `src/domains/domain-map.spec.ts` fails on duplicate or
  unmapped prefixes/tables, and `src/entity-metadata.spec.ts` fails on duplicate
  `@Entity` table names.
- Legacy prefixes remain mounted for existing clients but are marked
  `deprecated: true` in Swagger. New clients use the canonical routes above.
- Server-to-user pushes go through `/notifications`, which joins each
  authenticated socket to a `user:<id>` room. Emit an `EventEmitter2` event and
  handle it in `NotificationGateway` rather than adding a new gateway.
- Run `npm run knip:backend` from the repository root to find unused files and
  unresolved imports before adding a new feature module.
- The only genre enum is `songs/enums/genre.enum.ts`. It must match the contract's
  `Genre` and the frontend's `GENRE_VALUES`.

Cross-cutting HTTP behaviour is configured once in `src/config/app-setup.ts`:

- a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) — unknown fields are rejected with `400`;
- `AllExceptionsFilter`, so every HTTP error looks like
  `{ statusCode, error, message, path, timestamp, requestId }` (send `x-request-id` to correlate logs);
- request logging is handled by `RequestLoggerMiddleware` (see [Logging](#logging)).

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 6+
- (optional) a Soroban RPC endpoint, e.g. `https://soroban-testnet.stellar.org`

## Environment variables

Copy `.env.example` to `backend/.env` (or `.env.development`):

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | Enables Swagger; schema changes always go through migrations, in every environment |
| `LOG_LEVEL` | no | `info` | `error`, `warn`, `info`, `debug` or `verbose` |
| `PORT` | no | `3000` | HTTP/WebSocket port |
| `DATABASE_URL` | **yes** | — | e.g. `postgres://postgres:postgres@localhost:5432/lyricsflip` |
| `DB_MIGRATIONS_RUN` | no | `true` | Run pending migrations on startup |
| `JWT_SECRET` | **yes** | — | Access-token signing secret |
| `JWT_REFRESH_SECRET` | yes | — | Refresh-token signing secret |
| `JWT_ACCESS_TOKEN_TTL` / `JWT_REFRESH_TOKEN_TTL` | no | — | Token lifetimes (seconds) |
| `JWT_TOKEN_AUDIENCE` / `JWT_TOKEN_ISSUER` | no | — | JWT `aud` / `iss` claims |
| `STELLAR_NETWORK` | **yes** | — | `testnet`, `futurenet` or `mainnet` |
| `SOROBAN_RPC_URL` | no | — | Soroban RPC used by the indexer and `/health`; validated at boot |
| `LYRICSFLIP_CONTRACT_ID` | no | — | LyricsFlip game contract ID indexed by the indexer; validated with `StrKey.isValidContract` |
| `LYRICSFLIP_NFT_CONTRACT_ID` | no | — | NFT contract ID indexed alongside `LYRICSFLIP_CONTRACT_ID` (so `NftMinted` events are indexed); validated with `StrKey.isValidContract` |
| `REDIS_URL` | no | `redis://127.0.0.1:6379` | Throttler storage and health check |
| `REDIS_HOST` / `REDIS_PORT` | no | `localhost` / `6379` | Cache store |
| `RATE_LIMIT_TTL` / `RATE_LIMIT_LIMIT` | no | `60` / `10` | Default rate limit |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | no | `localhost` / `1025` | Outgoing email (Mailpit in docker compose) |
| `MAIL_FROM` | no | `LyricsFlip <no-reply@lyricsflip.local>` | Sender address |
| `PASSWORD_RESET_TTL_MINUTES` | no | `15` | Password-reset link lifetime |
| `APP_URL` | no | `http://localhost:3000` | Public URL used in emails/links |

Both contract IDs and `SOROBAN_RPC_URL` are validated at boot (Joi and a runtime `StrKey.isValidContract`
check). An invalid value stops the app with a clear message; in production, boot fails fast when the
indexer is enabled but misconfigured, instead of leaving the indexer silently idle.

## Running locally

```bash
cd backend
npm install

# start dependencies (or use your own Postgres/Redis)
docker run -d --name lf-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=lyricsflip -p 5432:5432 postgres:16
docker run -d --name lf-redis -p 6379:6379 redis:7

npm run migration:run   # apply migrations
npm run seed            # optional: seed songs
npm run start:dev       # http://localhost:3000
```

### Docker

From the repository root:

```bash
docker compose up                     # Postgres 16, Redis 7, Mailpit and the API on http://localhost:4000
docker compose --profile soroban up   # also start stellar/quickstart for a local Soroban network
```

The schema is applied on startup by running any pending migrations in `src/migrations` (set `DB_MIGRATIONS_RUN=false` to disable).
Emails sent by the API, such as password reset links, show up in Mailpit at http://localhost:8025.
Copy `.env.example` to `.env.development` to run the backend outside Docker.

## Migrations

Migrations live in `src/migrations` and use the data source in `src/database/data-source.ts` — the
same directory `app.module.ts` runs on startup (`DB_MIGRATIONS_RUN`), so the CLI and the running
app share one migration history. `synchronize` is always off; schema changes go through a migration
in every environment.

```bash
npm run migration:run              # apply pending migrations
npm run migration:revert           # roll back the last migration
npm run migration:show             # list applied/pending migrations
npm run migration:generate -- src/migrations/DescriptiveName   # generate one from entity changes
```

Workflow for a schema change:

1. Edit or add the entity.
2. Generate the migration from the diff:
   `npm run migration:generate -- src/migrations/DescriptiveName`.
3. Review the generated SQL (it is committed alongside the entity change).
4. Apply it locally with `npm run migration:run`; `npm run migration:show` lists applied/pending
   migrations and `npm run migration:revert` rolls back the last one.

CI enforces this: the `migrations` job runs `migration:run` and then a drift check
(`migration:generate --dryrun`, or a `schema:log` diff). If the check produces any SQL, the job
fails — so a PR that adds an entity column without a migration cannot merge.

## API docs and health

Every REST route is versioned under the global prefix `/api/v1` (URI versioning), e.g.
`/api/v1/auth/challenge` and `/api/v1/leaderboard`. Point the frontend's `NEXT_PUBLIC_API_URL` at
`http://localhost:3000/api/v1`. `/health` is excluded from the prefix.
The HTTP API is described by the generated Swagger document; contract-facing
functions, events and errors live in the generated
[`onchain/docs/api.md`](../onchain/docs/api.md). This README intentionally does
not copy endpoint tables or signatures — treat the generated docs as the source
of truth.

- Swagger UI: `http://localhost:3000/api/docs` (disabled when `NODE_ENV=production`)
- Health: `GET /health` (public, unversioned) — reports `database`, `redis` and `stellarRpc`; returns `200` when all are up and `503` otherwise.

## WebSocket protocol

Real-time multiplayer uses Socket.IO on the same port. Events, payloads and error codes are documented in [`docs/realtime-protocol.md`](../docs/realtime-protocol.md); the namespace map above is the only event summary kept here.

## Tests

```bash
npm test          # unit tests (src/**/*.spec.ts)
npm run test:cov  # unit tests with coverage (enforces the Jest coverage threshold)
npm run test:e2e  # e2e tests (test/*.e2e-spec.ts) — no live database required
```

## Useful scripts

| Script | Purpose |
| --- | --- |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled build |
| `npm run lint` / `npm run format` | ESLint / Prettier |

## Logging

There is one logger, `AppLogger` (`src/logger`). Use Nest's `new Logger(MyService.name)` in services;
it routes through `AppLogger`. Production writes JSON lines; other environments write readable lines.
Every HTTP request gets an `x-request-id` and exactly one access log line. Known secret fields
(passwords, tokens, authorization headers, JWTs) are redacted. Set `LOG_LEVEL` to `error`, `warn`, `info`, `debug` or `verbose`.
