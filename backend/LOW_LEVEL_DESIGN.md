# Tabi Backend — Low-Level Design

Companion to [HIGH_LEVEL_DESIGN.md](HIGH_LEVEL_DESIGN.md). Covers concrete
classes, endpoints, DTOs, the Prisma schema, and the non-obvious algorithms.

## 1. Data Model (Prisma)

Source of truth: [prisma/schema.prisma](prisma/schema.prisma).

### Entities

- **User** — `id, email?, phone?, username?, name?, password, refreshTokenHash?`.
  `email`, `phone`, `username` are each unique-but-nullable, so a user can
  exist with only a phone (OTP/mobile login) or only an email (signup).
- **Contact** — self-referential on `User` via `ContactOwner` (`userId`) and
  `ContactTarget` (`contactId`); `@@unique([userId, contactId])`. One-directional
  (A adding B as a contact does not create B→A).
- **Group** — `name, description?, photoUrl?, defaultCurrency` (default `USD`),
  `createdById`. Owns `members`, `expenses`, `settlements`, `messages`,
  `activityLogs`, `liveLocations`, `splitRules`.
- **GroupMember** — join table with `role` (`ADMIN`|`MEMBER`),
  `status` (`ACTIVE`|`PENDING`|`ARCHIVED`), `locationSharingEnabled`.
  `@@unique([groupId, userId])`.
- **Expense** — `title, totalAmount (Decimal 14,2), currency, category?,
  notes?, attachmentUrl?, expenseDate, splitType, isRecurring, recurringRule?,
  status (ACTIVE|DELETED)`. Has many `participants` and `items`.
- **ExpenseParticipant** — per-user `owedAmount`, `paidAmount`, plus
  split-type-specific fields (`exactAmount`, `percentage`, `shares`,
  `adjustmentAmount`) and a free-form `metadata` JSON. `@@unique([expenseId, userId])`.
- **ExpenseItem** / **ExpenseItemParticipant** — used only for `ITEMIZED`
  splits: an expense can have line items, each with its own participant list
  and per-user amount.
- **Settlement** — records a payment between two group members
  (`payerId → receiverId`, `amount`, `currency`, `status`, `settledAt`).
- **Message** — `type (TEXT|IMAGE|VIDEO|LOCATION|SYSTEM)`, `content?`,
  `mediaUrl?`, `latitude?/longitude?/mapLabel?` (for LOCATION messages).
- **LiveLocation** — one row per `(groupId, userId)` (`@@unique`), upserted on
  every location tick; `latitude, longitude, accuracy?, speed?, heading?, sharedAt`.
- **ActivityLog** — append-only: `groupId, actorId, action, entityType?,
  entityId?, metadata?, createdAt`.
- **SavedSplitRule** — user-scoped (optionally group-scoped) reusable split
  template: `name, splitType, config (Json)`.
- **OtpCode** — `phone, otp, expiresAt, used`; not tied to a `User` row.

### Enums

`GroupRole {ADMIN, MEMBER}`,
`ExpenseSplitType {EQUAL, UNEQUAL, PERCENTAGE, SHARE, ADJUSTMENT, ITEMIZED, CUSTOM}`,
`ExpenseCategory {TRAVEL, FOOD, STAY, TRANSPORT, SHOPPING, ENTERTAINMENT, UTILITIES, OTHER}`,
`MessageType {TEXT, IMAGE, VIDEO, LOCATION, SYSTEM}`,
`SettlementStatus {PENDING, COMPLETED, CANCELLED}`,
`ExpenseStatus {ACTIVE, DELETED}`,
`GroupMemberStatus {ACTIVE, PENDING, ARCHIVED}`.

Note: `CUSTOM` is a declared `ExpenseSplitType` but has no handler in
`ExpensesService.buildOwedAllocations` — passing it throws
`BadRequestException('Unsupported split type')`.

## 2. REST API Surface

All routes below (except `/auth/signup|login|mobile-login|refresh`,
`/auth/request-otp|verify-otp`) require `Authorization: Bearer <access_token>`
via `JwtAuthGuard`.

**Auth** — [src/auth/auth.controller.ts](src/auth/auth.controller.ts)
- `POST /auth/signup` — email+password+username → tokens + user
- `POST /auth/login` — email+password → tokens + user
- `POST /auth/mobile-login` — phone(+name) find-or-create → tokens + user
- `POST /auth/refresh` — refresh_token → new token pair (rotated)
- `GET /auth/profile` — current user (also gated by `AuthMiddleware`, see HLD §10)
- `POST /auth/change-password` — current+new password
- `POST /auth/logout` — clears `refreshTokenHash`

**OTP** — [src/otp/otp.controller.ts](src/otp/otp.controller.ts)
- `POST /auth/request-otp` — phone → generates 6-digit OTP, 10 min expiry,
  2-minute resend cooldown, logs OTP instead of sending SMS
- `POST /auth/verify-otp` — phone+otp → find-or-create user by phone → tokens

**Users** — [src/users/users.controller.ts](src/users/users.controller.ts)
- `GET /users` — search users by name/username/email/phone (`?query=`)
- `GET /users/profile` / `PATCH /users/profile` — self profile, with
  uniqueness checks on email/username/phone before update
- `DELETE /users/account` — hard delete

**Friends** — [src/friends/friends.controller.ts](src/friends/friends.controller.ts)
- `POST /friends/add-contact` — bulk add by phone number, per-item
  success/error result array
- `GET /friends` — list own contacts
- `GET /friends/discover` — search all users, annotated with `isContact`
- `DELETE /friends/:contactId` — remove a contact

**Groups** — [src/groups/groups.controller.ts](src/groups/groups.controller.ts)
- `POST /groups` — create; creator auto-added as `ADMIN`
- `GET /groups` — groups the caller is a member of
- `GET /groups/:id` — detail (member-only)
- `PATCH /groups/:id` — update (admin-only)
- `POST /groups/:id/members` — add member as `PENDING` (admin-only)
- `PATCH /groups/:id/members/status` — caller changes own membership status
- `DELETE /groups/:id/members/:userId` — remove member (admin-only, cannot remove creator)
- `DELETE /groups/:id` — delete group (creator-only)

**Expenses** — [src/expenses/expenses.controller.ts](src/expenses/expenses.controller.ts),
all under `/groups/:groupId/...`
- `POST /expenses` — create expense (see §3 for split algorithms)
- `GET /expenses` — list with filters: `query`, `category`, `participantUserId`, `fromDate`, `toDate`
- `GET /expenses/:expenseId` — detail
- `PATCH /expenses/:expenseId` — update metadata fields (creator-only; does **not** recompute splits)
- `DELETE /expenses/:expenseId` — soft delete (`status = DELETED`, creator-only)
- `GET /balances` — net balances + simplified debt graph (see §4)
- `POST /settlements/:receiverId` — record a payment from the caller (always `payerId = caller`) to `receiverId`, with `amount`/`currency`/`note` in the body
- `GET /settlements` — settlement history
- `POST /split-rules` / `GET /split-rules` — saved split templates
- `POST /equalize/:memberId` — retroactively add a new member into the last 50 active expenses (admin-only, see §5)

**Activity** — [src/activity/activity.controller.ts](src/activity/activity.controller.ts)
- `GET /groups/:groupId/activity` — chronological audit log

**Messages** — [src/messages/messages.controller.ts](src/messages/messages.controller.ts)
- `POST /groups/:groupId/messages` — send (REST fallback to the socket path)
- `GET /groups/:groupId/messages` — paginated history (`limit`, `beforeId`)

**Location** — [src/location/location.controller.ts](src/location/location.controller.ts)
- `PATCH /groups/:groupId/location/sharing` — toggle own location sharing
- `POST /groups/:groupId/location/live` — push a location update (REST fallback)
- `GET /groups/:groupId/location/live` — list currently-shared locations
- `POST /groups/:groupId/location/message` — send a location as a chat message with a Google Maps deep link

## 3. Expense Split Algorithms

All money math happens in **integer cents** (`MONEY_SCALE = 100`) inside
`ExpensesService` ([src/expenses/expenses.service.ts](src/expenses/expenses.service.ts))
to avoid floating-point drift, converting back to `Decimal` only at the
Prisma-write boundary.

| `splitType`   | Algorithm |
|----------------|-----------|
| `EQUAL`        | `distributeEvenly`: `floor(total/n)` each, then distributes the remainder cents one-by-one to the first N participants |
| `UNEQUAL`      | Caller supplies `exactAmount` per participant; validated to sum exactly to `totalAmount` |
| `PERCENTAGE`   | Percentages must sum to 100 (±0.001 tolerance); provisional amount = `floor(total * pct/100)`, remaining cents assigned to the participants with the largest fractional remainder first (largest-remainder method) |
| `SHARE`        | Same largest-remainder approach, weighted by `shares` instead of percentage |
| `ADJUSTMENT`   | Starts from an equal split, then applies a signed `adjustmentAmount` per participant; result must still sum to `totalAmount` |
| `ITEMIZED`     | Each `ExpenseItem` (amount × quantity) is split evenly across its own `participantUserIds`; per-user totals are summed across items; sum of item amounts must equal `totalAmount` |
| `CUSTOM`       | Not implemented — throws `BadRequestException` |

`buildPaidAllocations` performs the symmetric validation for the `paidBy`
array (who actually paid, must also sum to `totalAmount`, no duplicate payers).
`validateGroupMembership` then rejects any payer/participant who isn't a
current group member.

Each `ExpenseParticipant` row ends up storing both `paidAmount` and
`owedAmount` — the participant's net position is `paidAmount − owedAmount`.

## 4. Balances & Debt Simplification

`getGroupBalances(groupId, userId)`:
1. Sums `paidAmount`/`owedAmount` across all `ACTIVE` expenses, per user.
2. Applies all `COMPLETED` settlements as adjustments (`payer.paid += amount`,
   `receiver.owed += amount`) — settling a debt is modeled as an extra "payment".
3. Computes `net = paid − owed` per member (including zero-balance members from `GroupMember`).
4. Runs `simplifyDebts`: a greedy two-pointer matching of creditors
   (`net > 0`) against debtors (`net < 0`), each step settling
   `min(creditor.remaining, debtor.remaining)` and advancing whichever side
   hits zero. This minimizes the number of transactions needed to settle the
   group (a variant of the classic "splitwise minimum cash flow" algorithm),
   though it is not guaranteed globally-minimal for all debt graphs — it's a
   greedy heuristic, not the optimal min-transaction solve.

## 5. New-Member Equalization

`equalizeForNewMember(groupId, adminUserId, memberId)`: pulls the 50 most
recent `ACTIVE` expenses, and for each one the new member wasn't already a
participant of, re-runs `distributeEvenly` across `[existing participants..., memberId]`
and inserts a new `ExpenseParticipant` row for the new member with their
share of `owedAmount` (and `paidAmount = 0`). This changes historical expense
splits rather than creating new expenses — it does **not** rebalance what
existing participants owe (their `owedAmount` rows are left as-is), so the
group's total `owedAmount` across participants will exceed the expense's
`totalAmount` after equalization. Logged as `EQUALIZATION_EXECUTED` in
`ActivityLog`.

## 6. Auth Internals

- **Token generation** (`AuthService.generateTokens` /
  `OtpService.generateTokens`, duplicated in both services): access token
  `{ sub: userId }` signed 15m with `JWT_SECRET`; refresh token
  `{ sub: userId, type: 'refresh' }` signed 24h with `JWT_REFRESH_SECRET`;
  refresh token's bcrypt hash overwrites `User.refreshTokenHash`.
- **Refresh flow** (`AuthService.refresh`): verifies signature+expiry, checks
  `payload.type === 'refresh'`, loads the user, bcrypt-compares the presented
  token against `refreshTokenHash`, then issues (and stores) a brand new pair
  — i.e. refresh tokens are single-use/rotating.
- **Logout**: sets `refreshTokenHash = null`, invalidating all outstanding
  refresh tokens for that user (access tokens already issued remain valid
  until their 15-minute expiry — there is no access-token blocklist).
- **`JwtStrategy.validate`**: re-fetches the user from the DB on every
  request (not just trusting the JWT payload), returning
  `{ userId, email, username }` as `req.user`.
- **`CurrentUser` decorator** ([src/auth/decorators/current-user.decorator.ts](src/auth/decorators/current-user.decorator.ts)):
  pulls `req.user` into controller method params, typed as `AuthUser`
  ([src/common/interfaces/auth-user.interface.ts](src/common/interfaces/auth-user.interface.ts)).

## 7. Realtime Gateway Internals

[src/realtime/realtime.gateway.ts](src/realtime/realtime.gateway.ts), namespace `/realtime`.

**Connection lifecycle**
- `handleConnection`: extracts token from `handshake.auth.token` (preferred),
  falling back to `Authorization` header, falling back to `?token=` query
  param → verifies with `JWT_SECRET` → loads user → stores `client.data.user`
  → registers in `userSockets` map → auto-joins a Socket.IO room per existing
  group membership (`socketGroups` map tracks which rooms each socket joined).
- `handleDisconnect`: for every group room the socket was in, if this was the
  user's last connected socket in that room, emits `presence:update` with
  `status: 'offline'` to the room.

**In-memory state** (per gateway instance, not shared across processes):
- `userSockets: Map<userId, Set<socketId>>` — supports multiple tabs/devices per user.
- `socketGroups: Map<socketId, Set<groupId>>` — rooms a given socket has joined.

**Events (client → server)**

| Event | Payload | Behavior |
|---|---|---|
| `group:join` | `{ groupId }` | `GroupAccessService.ensureMember`, joins room, emits `group:joined` back and `presence:update` (online) to room if this is the user's first socket there |
| `group:leave` | `{ groupId }` | leaves room, emits `group:left`, emits `presence:update` (offline) if last socket |
| `message:send` | `{ groupId, message: CreateMessageDto }` | persists via `MessagesService.create`, broadcasts `message:new` to the room, returns the saved message (ack) |
| `message:history` | `{ groupId, limit?, beforeId? }` | emits `message:history` back to the requesting client only |
| `typing:start` / `typing:stop` | `{ groupId }` | broadcasts `typing:update` (`isTyping: true/false`) to the room, **excluding sender** |
| `location:share-toggle` | `{ groupId, payload: ToggleLocationSharingDto }` | updates `GroupMember.locationSharingEnabled`, broadcasts `location:sharing` to room |
| `location:update` | `{ groupId, payload: UpdateLiveLocationDto }` | upserts `LiveLocation` (only if sharing enabled), broadcasts `location:update` to room if actually updated |
| `location:send-message` | `{ groupId, payload: UpdateLiveLocationDto }` | builds a Google Maps deep link, persists as a `LOCATION` message, broadcasts `message:new` |

**Events (server → client)**: `auth:ok` / `auth:error`, `group:joined` /
`group:left` / `group:error`, `presence:update`, `message:new` /
`message:history`, `typing:update`, `location:sharing`, `location:update`.

All handlers wrap business logic in try/catch and emit `group:error` with
`{ context, message }` on failure rather than throwing — the socket
connection itself is never torn down by a business-logic error (only by auth
failures).

## 8. Module Dependency Notes

- `GroupAccessService` lives inside `GroupsModule` but is imported directly by
  `ExpensesModule`, `MessagesModule`, `LocationModule`, and `RealtimeModule` —
  it's the shared authorization primitive, not just a `GroupsService` helper.
- `ActivityService` is injected into `ExpensesService`, `MessagesService`, and
  `LocationService` to centralize audit logging; it has no controller-facing
  write endpoint of its own (only `GET /groups/:groupId/activity`).
- `PrismaService` ([src/prisma/prisma.service.ts](src/prisma/prisma.service.ts))
  is a thin `PrismaClient` subclass registered as a global-ish provider via
  `PrismaModule`, injected everywhere; no repository abstraction on top of it.
