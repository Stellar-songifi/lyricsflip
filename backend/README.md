<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

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

Rules of thumb:

- One WebSocket namespace per concern. Server-to-user pushes go through
  `/notifications`, which joins each authenticated socket to a `user:<id>` room.
  Emit an `EventEmitter2` event and handle it in `NotificationGateway` rather than
  adding a new gateway.
- The only genre enum is `songs/enums/genre.enum.ts`. It must match the contract's
  `Genre` and the frontend's `GENRE_VALUES`.
- `src/entity-metadata.spec.ts` fails if two `@Entity` classes map to the same table.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## Local development with Docker

From the repository root:

```bash
docker compose up                     # Postgres 16, Redis 7, Mailpit and the API on http://localhost:4000
docker compose --profile soroban up   # also start stellar/quickstart for a local Soroban network
```

The schema is applied on startup (`DB_SYNCHRONIZE`, plus any migrations in `src/migrations`).
Emails sent by the API, such as password reset links, show up in Mailpit at http://localhost:8025.
Copy `.env.example` to `.env.development` to run the backend outside Docker.

## Logging

There is one logger, `AppLogger` (`src/logger`). Use Nest's `new Logger(MyService.name)` in services;
it routes through `AppLogger`. Production writes JSON lines; other environments write readable lines.
Every HTTP request gets an `x-request-id` and exactly one access log line. Known secret fields
(passwords, tokens, authorization headers, JWTs) are redacted. Set `LOG_LEVEL` to `error`, `warn`, `info`, `debug` or `verbose`.
