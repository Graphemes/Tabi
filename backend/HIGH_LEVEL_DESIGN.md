# Tabi Backend — High-Level Design

## 1. Purpose

Tabi's backend is the API and real-time server for a group trip-planning app that
combines WhatsApp-style group chat, shared expense splitting (Splitwise-style),
and live location sharing. It exposes a REST API for CRUD/business operations and
a WebSocket gateway for chat, presence, and live location updates.

## 2. Tech Stack

| Concern            | Choice                                         |
|---------------------|------------------------------------------------|
| Framework           | NestJS 9 (Express platform)                    |
| Language            | TypeScript                                     |
| Database            | PostgreSQL 16                                  |
| ORM                 | Prisma 5 (`@prisma/client`)                     |
| Auth                | JWT (access + refresh) via `@nestjs/jwt`, `passport-jwt` |
| Real-time transport | Socket.IO via `@nestjs/websockets` / `@nestjs/platform-socket.io` |
| Password hashing    | bcrypt                                          |
| Validation          | `class-validator` / `class-transformer` (global `ValidationPipe`) |
| SMS/OTP provider     | Twilio dependency present (OTP delivery currently logged, not sent) |

Entry point: [src/main.ts](src/main.ts) — boots Nest, enables CORS, applies a
global `ValidationPipe` (`whitelist`, `transform`, `forbidNonWhitelisted`), and
listens on `PORT` (default `3001`).

## 3. Architectural Style

Classic **modular monolith**, one NestJS module per bounded context, all sharing
a single Postgres database through a single `PrismaService`. There is no
message queue, cache layer, or separate read model — every module reads/writes
Prisma directly. Real-time fan-out (chat, presence, live location) happens
in-process through a single Socket.IO gateway that also talks to the same
Prisma-backed services used by the REST controllers, so REST and WebSocket
paths share business logic instead of duplicating it.

```
                        ┌─────────────────────────────┐
                        │        Next.js Frontend      │
                        └───────────┬──────────┬──────┘
                                    │ REST/HTTP │ WebSocket (Socket.IO)
                                    ▼           ▼
                    ┌───────────────────────────────────────┐
                    │              NestJS App                │
                    │  ┌───────────────────────────────────┐ │
                    │  │  Global: ValidationPipe, CORS       │ │
                    │  └───────────────────────────────────┘ │
                    │                                         │
                    │  AuthModule   OtpModule   UsersModule   │
                    │  FriendsModule  GroupsModule             │
                    │  ExpensesModule  MessagesModule           │
                    │  LocationModule  ActivityModule           │
                    │  RealtimeModule (Socket.IO gateway)       │
                    │                                         │
                    │        all modules → PrismaService      │
                    └───────────────────┬─────────────────────┘
                                        │
                                        ▼
                              ┌─────────────────┐
                              │   PostgreSQL 16   │
                              └─────────────────┘
```

## 4. Module Map

| Module            | Responsibility                                                        |
|--------------------|-------------------------------------------------------------------------|
| `PrismaModule`      | Wraps `PrismaClient` as an injectable, app-wide DB access service        |
| `AuthModule`        | Email/password signup+login, mobile "quick login", JWT issuing/refresh, change password, logout |
| `OtpModule`         | Phone-based OTP request/verify, doubles as passwordless login/signup     |
| `UsersModule`       | Profile read/update/delete, generic user search                          |
| `FriendsModule`     | Contact list, add-by-phone (bulk), discover other users                  |
| `GroupsModule`      | Group CRUD, membership management, role/status (`ADMIN`/`MEMBER`, `ACTIVE`/`PENDING`/`ARCHIVED`) |
| `ExpensesModule`    | Expense CRUD, 7 split-type algorithms, balances/debt simplification, settlements, saved split rules, new-member equalization |
| `MessagesModule`    | Group chat message persistence (text/image/video/location/system)        |
| `LocationModule`    | Per-user location-sharing toggle, live-location upsert, Google Maps deep links |
| `ActivityModule`    | Append-only audit log per group (who did what, when)                     |
| `RealtimeModule`    | Socket.IO gateway (`/realtime` namespace) — auth, presence, chat, typing, live location, delegates persistence to Messages/Location services |

`AppModule` ([src/app.module.ts](src/app.module.ts)) wires all of the above.

## 5. Authentication & Authorization

Three ways to obtain a session, all converging on the same JWT pair:

1. **Email/password** — `POST /auth/signup`, `POST /auth/login`
2. **Mobile quick login** — `POST /auth/mobile-login` (finds-or-creates a user by phone, no password check)
3. **OTP login** — `POST /auth/request-otp` → `POST /auth/verify-otp` (finds-or-creates a user by phone)

All three issue:
- **Access token**: JWT, 15 min TTL, signed with `JWT_SECRET`
- **Refresh token**: JWT, 24h TTL, signed with `JWT_REFRESH_SECRET`, its bcrypt
  hash stored on `User.refreshTokenHash` so a refresh token can be invalidated
  server-side (rotated on every refresh, cleared on logout)

REST authorization is `JwtAuthGuard` (Passport `jwt` strategy) applied per
controller (e.g. `@UseGuards(JwtAuthGuard)` on `GroupsController`,
`ExpensesController`, etc.), which decodes the bearer token and re-fetches the
user via `JwtStrategy.validate`. WebSocket authorization is handled separately
inside `RealtimeGateway.handleConnection` (verifies the JWT passed via
`socket.handshake.auth.token`, header, or query string).

Group-level authorization (is this user a member/admin of this group?) is
centralized in `GroupAccessService.ensureMember` / `ensureAdmin`, called by
every group-scoped service (expenses, messages, location, groups) rather than
duplicated per module.

## 6. Real-Time Design

Single Socket.IO namespace `/realtime`. On connect, the gateway authenticates
the JWT, looks up the user's group memberships, and auto-joins one Socket.IO
room per group (`group:<id>`). All chat/presence/typing/location events are
scoped to that room. The gateway keeps two in-memory maps
(`userId → socketIds`, `socketId → groupIds`) to support multi-device presence
(a user is "online" in a group as long as at least one of their sockets is in
that room) — see [src/realtime/realtime.gateway.ts](src/realtime/realtime.gateway.ts).

Events: `group:join` / `group:leave`, `message:send` / `message:history` /
`message:new`, `typing:start` / `typing:stop` / `typing:update`,
`location:share-toggle` / `location:update` / `location:sharing`,
`location:send-message`, plus `presence:update` and `auth:ok` / `auth:error`.

## 7. Data Model (summary)

Core entities (full detail in [LOW_LEVEL_DESIGN.md](LOW_LEVEL_DESIGN.md) and
[prisma/schema.prisma](prisma/schema.prisma)):

`User` → `GroupMember` ↔ `Group` → `Expense` → `ExpenseParticipant` /
`ExpenseItem` → `ExpenseItemParticipant`; `Settlement`; `Message`;
`LiveLocation`; `ActivityLog`; `SavedSplitRule`; `Contact` (self-referential
on `User`); `OtpCode`.

Money is stored as `Decimal(14,2)`; all split/settlement math internally works
in integer cents to avoid floating-point rounding errors.

## 8. Cross-Cutting Concerns

- **Validation**: global `ValidationPipe` rejects unknown fields and
  coerces/validates every DTO.
- **Error handling**: standard Nest exceptions (`BadRequestException`,
  `NotFoundException`, `ForbiddenException`, `UnauthorizedException`) mapped
  to HTTP status codes; no custom exception filter.
- **Auditability**: `ActivityService.log` is called from expenses, messages,
  and location services on every mutating action, giving each group a
  chronological activity feed.
- **CORS**: wide open (`app.enableCors()` with no restriction) — acceptable
  for local/dev, should be tightened for production.

## 9. Deployment / Runtime

- Local dev: `npm run start:dev` (Nest watch mode), Postgres via
  `docker-compose.yml` (or a local Postgres instance) on port 5432.
- Prisma migrations live under `prisma/migrations`; `DATABASE_URL` in `.env`.
- Production build: `npm run build` → `node dist/main` (`start:prod`).
- No containerization of the Nest app itself is defined yet (only Postgres has
  a compose service).

## 10. Known Gaps / Non-Functional Notes

- `AuthMiddleware` ([src/auth/middleware/auth.middleware.ts](src/auth/middleware/auth.middleware.ts))
  duplicates what `JwtAuthGuard` does and is only wired to `GET /auth/profile`;
  the rest of the app relies on the guard. Redundant, not harmful.
- OTPs are logged via `Logger.log`, not actually sent through Twilio yet —
  fine for development, a gap for production.
- No rate limiting, no refresh-token-family reuse detection beyond hash
  comparison, no RBAC beyond group `ADMIN`/`MEMBER`.
- Single Postgres instance, no caching layer, no horizontal-scaling story for
  the in-memory Socket.IO presence maps (would need a Redis adapter to run
  multiple Nest instances behind a load balancer).
