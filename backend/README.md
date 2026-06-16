<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
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
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).
# Tabi

Tabi backend now includes core group, expense sharing, settlement, chat, and live-location APIs for a Splitwise-like trip collaboration app.

## Implemented API modules

- Auth (signup/login/profile)
- Groups (create/list/view/update/add member/remove member/delete)
- Expenses (create with advanced split types, search/filter, edit, soft-delete)
- Balances and debt simplification
- Settlements (partial/full settle up)
- Saved split rules
- Equalization helper for newly added members
- Group activity log
- Group chat messages (text/image/video/location message payloads)
- Live location sharing toggle and location stream endpoints

## Split types currently supported

- Equal split
- Unequal exact amount split
- Percentage-based split
- Share-based split
- Adjustment split
- Split by item

## Key endpoint groups

- `POST /groups/:groupId/expenses`
- `GET /groups/:groupId/expenses`
- `PATCH /groups/:groupId/expenses/:expenseId`
- `DELETE /groups/:groupId/expenses/:expenseId`
- `GET /groups/:groupId/balances`
- `POST /groups/:groupId/settlements/:receiverId`
- `GET /groups/:groupId/settlements`
- `POST /groups/:groupId/split-rules`
- `GET /groups/:groupId/split-rules`
- `POST /groups/:groupId/equalize/:memberId`
- `POST /groups/:groupId/messages`
- `GET /groups/:groupId/messages`
- `PATCH /groups/:groupId/location/sharing`
- `POST /groups/:groupId/location/live`
- `GET /groups/:groupId/location/live`
- `POST /groups/:groupId/location/message`
- `GET /groups/:groupId/activity`

## Production-ready notes

This repo now has strong feature groundwork, but before launch you should still add:

- Real file upload pipeline (S3/GCS) for receipt/images/video
- Websocket gateway for realtime chat and live-location push
- Rate limiting, idempotency keys, request tracing, structured logs
- Currency FX conversion and ledger strategy for multi-currency balances
- Payment gateway settlement integration (future scope)
- End-to-end tests, contract tests, and load tests
- Background jobs for recurring expense materialization

## Validation and API behavior

- Global request validation is enabled in `src/main.ts`
- DTOs use class-validator rules for all new modules
- All group resources enforce membership/authorization checks
