# LyricsFlip Backend

NestJS API and WebSocket server for **LyricsFlip**, a lyrics-guessing game with on-chain wagers and rewards on Stellar/Soroban. It handles auth, players, songs and questions, game sessions (single-player and real-time multiplayer), scoring, leaderboards, and indexing of contract events.

## Module map

Each concern has exactly one module. Entities are owned by the module listed
here; other modules import that module (or its entity) instead of redefining it.

| Concern | Module | Owns | HTTP | WebSocket namespace |
| --- | --- | --- | --- | --- |
| Auth | `auth/` | JWT issue/verify, `AccessTokenGuard` (global), `JwtAuthGuard`, `WsAuthenticator`, `@CurrentUser()` | `/auth` | — |
| Users | `user/` | `User` (`users`, incl. `stellarAddress` for wallet login) | `/user` | — |
| Players | `player/` | `Player` (`players`), `PlayerStatus` | — | — |
| Songs | `songs/` | `Song` (`songs`, mirrors the contract `Card`), `Tag`, `UserGenrePreference`, `Genre` enum | `/songs`, `/songs/genres` | — |
| Rooms | `room/` | `Room` (`rooms`), `PlayerRoom`; room CRUD, join/leave, player presence | `/rooms` | `/rooms` |
| Game | `game/` | Built-in game modes, scoring strategies, matchmaking, stats, `CustomGameMode` | `/game-modes` | `/game` |
| Game sessions | `game-session/` | `GameSession` (`game_sessions`) for every mode, tournaments and insights | `/game-session` | — |
| Notifications | `notification/` | `Notification` (`notifications`); also pushes achievement and progression events | `/notifications` | `/notifications` |
| Chain indexer | `indexer/` | Soroban event indexing | — | `/indexer` |
| Lesson progress | `music-education/` | `LessonProgress` (`lesson_progress`) | `/lessons/progress` | — |
| Practice progress | `practice/` | `PracticeProgress` (`practice_progress`) | `/practice/progress` | — |
| Health | `health/` | Postgres, Redis and Stellar RPC checks | `/health` | — |

Rules of thumb:

- One WebSocket namespace per concern. Server-to-user pushes go through
  `/notifications`, which joins each authenticated socket to a `user:<id>` room.
  Emit an `EventEmitter2` event and handle it in `NotificationGateway` rather than
  adding a new gateway.
- The only genre enum is `songs/enums/genre.enum.ts`. It must match the contract's
  `Genre` and the frontend's `GENRE_VALUES`.
- `src/entity-metadata.spec.ts` fails if two `@Entity` classes map to the same table.

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
| `SOROBAN_RPC_URL` | no | — | Soroban RPC used by the indexer and `/health` |
| `REDIS_URL` | no | `redis://127.0.0.1:6379` | Throttler storage and health check |
| `REDIS_HOST` / `REDIS_PORT` | no | `localhost` / `6379` | Cache store |
| `RATE_LIMIT_TTL` / `RATE_LIMIT_LIMIT` | no | `60` / `10` | Default rate limit |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | no | `localhost` / `1025` | Outgoing email (Mailpit in docker compose) |
| `MAIL_FROM` | no | `LyricsFlip <no-reply@lyricsflip.local>` | Sender address |
| `PASSWORD_RESET_TTL_MINUTES` | no | `15` | Password-reset link lifetime |
| `APP_URL` | no | `http://localhost:3000` | Public URL used in emails/links |

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

## API docs and health

- Swagger UI: `http://localhost:3000/api/docs` (disabled when `NODE_ENV=production`)
- Health: `GET /health` (public) — reports `database`, `redis` and `stellarRpc`; returns `200` when all are up and `503` otherwise.

## WebSocket protocol

Real-time multiplayer uses Socket.IO on the same port. Events, payloads and error codes are documented in [`docs/realtime-protocol.md`](../docs/realtime-protocol.md).

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
