# LyricsFlip Backend

NestJS API and WebSocket server for **LyricsFlip**, a lyrics-guessing game with on-chain wagers and rewards on Stellar/Soroban. It handles auth, players, songs and questions, game sessions (single-player and real-time multiplayer), scoring, leaderboards, and indexing of contract events.

## Module map

| Area | Modules (`src/`) |
| --- | --- |
| Auth & users | `auth` (JWT access/refresh, global `AccessTokenGuard`, `@Public()`), `user`, `player` |
| Content | `song`, `songs`, `song-genre`, `questions`, `music-education` |
| Gameplay | `game-session`, `game-mode`, `websocket-game comms` (Socket.IO gateway), `scoring`, `power-ups`, `state-recovery` |
| Competition | `leaderboard`, `tournament`, `achievement`, `wager`, `reward`, `referral` |
| Social | `social`, `chat-room`, `notification` |
| On-chain | `indexer` (polls Soroban RPC for contract events) |
| Platform | `config`, `logger`, `health`, `common` (guards, throttler, pagination), `filters`, `interceptors` |

Cross-cutting HTTP behaviour is configured once in `src/config/app-setup.ts`:

- a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) — unknown fields are rejected with `400`;
- `AllExceptionsFilter`, so every HTTP error looks like
  `{ statusCode, error, message, path, timestamp, requestId }` (send `x-request-id` to correlate logs);
- `LoggingInterceptor` for request logging and timing.

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 6+
- (optional) a Soroban RPC endpoint, e.g. `https://soroban-testnet.stellar.org`

## Environment variables

Create `backend/.env`:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development` enables TypeORM `synchronize` and Swagger |
| `PORT` | no | `3000` | HTTP/WebSocket port |
| `DATABASE_URL` | **yes** | — | e.g. `postgres://postgres:postgres@localhost:5432/lyricsflip` |
| `JWT_SECRET` | **yes** | — | Access-token signing secret |
| `JWT_REFRESH_SECRET` | yes | — | Refresh-token signing secret |
| `JWT_ACCESS_TOKEN_TTL` / `JWT_REFRESH_TOKEN_TTL` | no | — | Token lifetimes (seconds) |
| `JWT_TOKEN_AUDIENCE` / `JWT_TOKEN_ISSUER` | no | — | JWT `aud` / `iss` claims |
| `STELLAR_NETWORK` | **yes** | — | `testnet`, `futurenet` or `mainnet` |
| `SOROBAN_RPC_URL` | no | — | Soroban RPC used by the indexer and `/health` |
| `REDIS_URL` | no | `redis://127.0.0.1:6379` | Throttler storage and health check |
| `REDIS_HOST` / `REDIS_PORT` | no | `localhost` / `6379` | Cache store |
| `RATE_LIMIT_TTL` / `RATE_LIMIT_LIMIT` | no | `60` / `10` | Default rate limit |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | no | — | Outgoing email |
| `APP_URL` | no | — | Public URL used in emails/links |

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

A full `docker compose` setup for the API, Postgres and Redis is tracked in LF-100. Until it lands, run Postgres and Redis in containers as shown above and the API with `npm run start:dev`.

## Migrations

Migrations live in `src/database/migrations` and use the data source in `src/database/data-source.ts`.

```bash
npm run migration:run
```

In `development`, TypeORM `synchronize` is on; never rely on it in staging/production.

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
