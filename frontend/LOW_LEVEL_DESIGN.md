# Tabi Frontend — Low-Level Design

Companion to [HIGH_LEVEL_DESIGN.md](HIGH_LEVEL_DESIGN.md). Covers concrete
components, state shapes, and client/server contracts.

## 1. App Shell & Navigation

[src/app/page.tsx](src/app/page.tsx) renders only `<TripShareShell />`.
[src/features/tripshare/tripshare-shell.tsx](src/features/tripshare/tripshare-shell.tsx)
owns all top-level state:

```ts
activeTab: "groups" | "expenses" | "map" | "chat"
selectedGroupId: number | null
activeOverlay: "create-group" | "profile" | "add-expense" | null
loginStep: "phone" | "otp"
pendingPhone: string
otpValue: string
```

**Render logic** (in priority order once authenticated):
1. `activeOverlay === "create-group"` → `<CreateNewGroup>`
2. `activeOverlay === "add-expense"` (requires `selectedGroup`) → `<AddExpense>`
3. `activeOverlay === "profile"` → `<ProfilePage>`
4. `activeTab === "chat"` (with `selectedGroup`) → `<ChatView>`
5. `activeTab === "groups"` → `<MyTrips>` (selecting a group sets
   `selectedGroupId` **and** switches `activeTab` to `"chat"`)
6. `activeTab === "expenses"` → `<ExpensesView>`
7. else → `<MapView>`

Not authenticated (`!accessToken || !authUser`): renders phone-entry form
(`loginStep === "phone"`) or OTP-entry form (`loginStep === "otp"`) inline,
no separate route.

**Login flow** (phone+OTP only — this is the reachable path from `page.tsx`):
1. `loginSchema` (zod, inline in the shell file) validates a 10-digit mobile
   number via `react-hook-form`.
2. Submit → `pendingPhone = "+91" + mobile` → `requestOtpMutation` →
   `POST /auth/request-otp` → on success, `loginStep = "otp"`.
3. OTP entry (4–6 digits) → `verifyOtpMutation` → `POST /auth/verify-otp` →
   on success, `useAuthStore.setAuth({ accessToken, refreshToken, user })`
   and `queryClient.invalidateQueries(["profile"])`.

Note: the mobile number is hardcoded to the `+91` (India) country code.

## 2. Auth Store

[src/store/auth-store.ts](src/store/auth-store.ts) — Zustand, no persistence
middleware; instead it manually mirrors to three `localStorage` keys on every
write and hydrates from them synchronously at store-creation time (so it
survives full page reloads, but only correctly on the client — the initial
read is guarded with `typeof window !== "undefined"`).

```ts
type AuthState = {
  accessToken: string | null;   // localStorage "tabi.accessToken"
  refreshToken: string | null;  // localStorage "tabi.refreshToken"
  user: User | null;            // localStorage "tabi.user" (JSON)
  setAuth(payload): void;       // writes all three keys + state
  clearAuth(): void;            // removes all three keys, nulls state
};
```

`User` shape: `{ id, email?, username?, name?, mobile?, phone? }` — a union of
fields returned by the different login endpoints (email/password vs
mobile/OTP), so most fields are optional and callers fall back across them
(e.g. `authUser.name || authUser.username || authUser.email || authUser.phone`).

## 3. HTTP Client & Token Refresh

[src/lib/http.ts](src/lib/http.ts) — single axios instance, `baseURL: env.apiBaseUrl`, 15s timeout.

- **Request interceptor**: reads `tabi.accessToken` from `localStorage`
  directly (not from the Zustand store) and sets
  `Authorization: Bearer <token>` if present.
- **Response interceptor** (401 handling):
  - Skips retry if the failing request was itself `/auth/refresh`, or if
    `originalRequest._retry` is already set (prevents infinite loops).
  - If a refresh is already in flight (`isRefreshing`), queues the caller's
    promise in `failedQueue` and resolves it once the in-flight refresh
    completes, replaying the original request with the new token.
  - Otherwise, sets `isRefreshing = true`, reads `tabi.refreshToken`, calls
    `POST /auth/refresh` on a **bare** axios call (bypassing the interceptor
    to avoid recursion), writes the new tokens to `localStorage` directly and
    to `useAuthStore` (reusing the currently-known `user`), flushes
    `failedQueue`, and retries the original request.
  - On refresh failure: rejects the whole queue and calls
    `useAuthStore.getState().clearAuth()` — this is the only place that logs
    the user out automatically; there's no redirect, so the shell just
    re-renders into the login screen because `accessToken` becomes `null`.

## 4. Realtime Client

[src/lib/socket.ts](src/lib/socket.ts) — module-level singleton (`socketInstance`),
lazily created by `getSocket(token?)`:
- Connects to `${env.socketBaseUrl}/realtime` (must match the backend's
  namespace), `transports: ["websocket"]`, `autoConnect: false` (callers must
  explicitly `.connect()`).
- `auth` is set from the passed-in token, falling back to
  `localStorage["tabi.accessToken"]`.
- Calling `getSocket(token)` again on an existing instance just updates
  `.auth` — it does not reconnect with the new token automatically; a caller
  must disconnect/reconnect for a token rotation to take effect on an
  already-open socket.
- `disconnectSocket()` tears down and nulls the singleton.

Consumers: `ChatView` (message send/receive), the `location:send-message`
emit inside `ChatView`'s attachment menu, and the currently-unmounted
`SocketStatus` component ([src/features/realtime/components/socket-status.tsx](src/features/realtime/components/socket-status.tsx)).

Typed socket event payloads live in [src/types/group-events.ts](src/types/group-events.ts),
[src/types/message.ts](src/types/message.ts), [src/types/location.ts](src/types/location.ts)
— these mirror the backend's DTOs but are **not currently used** by
`ChatView` (which emits/consumes with inline object literals and `ApiMessage`
instead); they read as a typed-client layer that was started but not finished
wiring in.

## 5. API Client (`features/whatsapp/api.ts`)

[src/features/whatsapp/api.ts](src/features/whatsapp/api.ts) is the single
source of REST calls for the active app (despite living under a `whatsapp/`
directory — a naming leftover). All functions are thin axios wrappers
returning `response.data`, no additional caching/retry logic (that's TanStack
Query's job at the call site).

| Function | Method & path |
|---|---|
| `mobileLogin` | `POST /auth/mobile-login` |
| `requestOtp` | `POST /auth/request-otp` |
| `verifyOtp` | `POST /auth/verify-otp` |
| `listContacts` | `GET /friends` |
| `discoverUsers` | `GET /friends/discover?query=` |
| `addContact` | `POST /friends/add-contact` |
| `getGroups` | `GET /groups` |
| `createGroup` | `POST /groups` |
| `addGroupMember` | `POST /groups/:groupId/members` |
| `getMessages` | `GET /groups/:groupId/messages` (reverses the backend's newest-first order to oldest-first for chat rendering) |
| `sendMessage` | `POST /groups/:groupId/messages` (REST fallback; live sends go over the socket) |
| `sendLocationMessage` | `POST /groups/:groupId/location/message` |
| `getProfile` | `GET /users/profile` |
| `updateProfile` | `PATCH /users/profile` |
| `changePassword` | `POST /auth/change-password` |
| `deleteAccount` | `DELETE /users/account` |
| `updateMemberStatus` | `PATCH /groups/:groupId/members/status` |
| `logout` | `POST /auth/logout` |
| `listGroupExpenses` | `GET /groups/:groupId/expenses` |
| `getGroupBalances` | `GET /groups/:groupId/balances` |
| `createExpense` | `POST /groups/:groupId/expenses` (always builds an `EQUAL` split across every group member — see §6, this helper is not actually called by `AddExpense`) |

## 6. Feature Components

### `MyTrips` ([my-trips.tsx](src/features/tripshare/my-trips.tsx))
Client-side search (`name` substring, case-insensitive) and filter chips
(`All Trips` / `Active` / `Pending` / `Archived`) over the already-fetched
`groups` array — no server round-trip per filter change. Filtering by status
checks the **current user's own** `GroupMember.status` within each group.
Archive/unarchive buttons call `updateMemberStatus(groupId, "ARCHIVED"|"ACTIVE")`
directly (no `useMutation`/cache invalidation — relies on the next `getGroups`
refetch to reflect the change). FAB triggers `onFabClick` → shell sets
`activeOverlay = "create-group"`.

### `ExpensesView` ([expenses-view.tsx](src/features/tripshare/expenses-view.tsx))
Uses `useQueries` to fan out one `listGroupExpenses` call per group in
parallel, flattens all results into a single list, sorts by `expenseDate`
descending. Pure read view — no create/edit actions here (those live in
`AddExpense`).

### `ChatView` ([chat-view.tsx](src/features/tripshare/chat-view.tsx))
- Loads history via `useQuery(["groups", groupId, "messages"], getMessages)`.
- On mount (when `accessToken` present), gets the shared socket, subscribes
  to `message:new`, and appends incoming messages straight into the React
  Query cache with `queryClient.setQueryData` (de-duplicated by `id`) —
  no `staleTime`/refetch race because the socket write and the query cache
  are the same object.
- Sending text: emits `message:send` over the socket (not REST) with
  `{ groupId, message: { type: "TEXT", content } }`; the server's ack/broadcast
  round-trip is what actually lands the message in the cache (via the
  `message:new` listener), not the emit call's return value.
- Sending location: browser `navigator.geolocation.getCurrentPosition` →
  emits `location:send-message` with `{ groupId, payload: { latitude, longitude } }`.
- Renders `LOCATION` message types as a tappable link (opens the Google Maps
  URL the backend generated); everything else renders as plain text bubbles,
  left/right-aligned by `senderId === authUser.id`.
- The "+" attachment menu (Camera/Gallery/Location/Expense) — only Location
  and Expense are wired; Camera/Gallery just close the menu with no-op handlers.

### `CreateNewGroup` ([create-new-group.tsx](src/features/tripshare/create-new-group.tsx))
Searches users via `discoverUsers(searchQuery)` (server-side search, top 20
shown), lets the caller multi-select member IDs, then on submit:
`createGroup({ name })` → sequential `addGroupMember(group.id, userId)` per
selected user (N+1 requests, not a bulk endpoint). On success, invalidates
`["groups"]` and closes the overlay.

### `AddExpense` ([add-expense.tsx](src/features/tripshare/add-expense.tsx))
- Local `SplitMode = "EQUAL" | "PERCENTAGE" | "EXACT"`, mapped to the
  backend's `ExpenseSplitType` at submit time: `EQUAL → EQUAL`,
  `PERCENTAGE → PERCENTAGE`, `EXACT → UNEQUAL`. The UI exposes this mode under
  different labels depending on context (`Adj.` / `Shares` / `Exact`), but
  all three still submit as plain `UNEQUAL` with `exactAmount` — the
  backend's dedicated `SHARE` and `ADJUSTMENT` split types are not reachable
  from this screen.
- Members can be excluded from a split via `excludedIds`; `paidBy` is always
  a single payer (`selectedPayerId`), defaulting to the current user.
- **Bypasses `features/whatsapp/api.ts`**: calls `http.post(/groups/:id/expenses, ...)`
  directly, so this endpoint's request shape is defined here, independently
  of `createExpense()` in `api.ts` (which is unused by this component).
- **Category mismatch (bug)**: `categoryMap` sends `FOOD_AND_DRINK`,
  `TRANSPORTATION`, `ACCOMMODATION`, `HEALTHCARE`, none of which exist in the
  backend's `ExpenseCategory` enum (`TRAVEL, FOOD, STAY, TRANSPORT, SHOPPING,
  ENTERTAINMENT, UTILITIES, OTHER`); the backend's `@IsEnum` validator will
  reject these with a 400. Only `General → OTHER`, `Shopping → SHOPPING`,
  `Entertainment → ENTERTAINMENT`, `Utilities → UTILITIES` currently match.

### `ProfilePage` ([profile-page.tsx](src/features/tripshare/profile-page.tsx))
`useQuery(["profile", userId], getProfile)` hydrates a local form; `PATCH`
via `updateProfile`, propagating the response back into `useAuthStore` via
`setAuth` (keeping `localStorage["tabi.user"]` in sync). Also exposes
"Logout" (`clearAuth`, no server-side call to `POST /auth/logout` is made
from here) and "Delete account" (behind a confirm step, calls `deleteAccount`
then `clearAuth`).

### `MapView` ([map-view.tsx](src/features/tripshare/map-view.tsx))
Static placeholder — a search bar and a "Share My Location" row with no
handlers wired, and a gray box where a map would render. No `LocationService`
integration on this screen yet (live location is only exercised via the chat
attachment menu's one-shot "send my location as a message").

## 7. UI Primitives

[src/components/ui/](src/components/ui/) — shadcn-generated `button.tsx`,
`card.tsx`, `input.tsx`, `label.tsx`, using `class-variance-authority` +
`tailwind-merge` (`cn()` in [src/lib/utils.ts](src/lib/utils.ts)) for variant
composition. Feature components largely bypass these and use raw
Tailwind-styled `<div>`/`<button>`/`<input>` with inline hex colors instead
(only `Button`/`Card`/`Input` from tripshare-shell.tsx's login screens
actually use the shared primitives).

## 8. Query Key Conventions

| Key | Populated by | Invalidated by |
|---|---|---|
| `["groups"]` | `getGroups` | creating a group, member status change (implicitly via refetch, no explicit invalidate) |
| `["groups", groupId, "expenses"]` | `listGroupExpenses` | `AddExpense` submit |
| `["groups", groupId, "messages"]` | `getMessages` (initial), socket `message:new` (append) | — |
| `["profile", userId]` | `getProfile` | `ProfilePage` update (via `setAuth`, not query invalidation) |
| `["discover", searchQuery]` | `discoverUsers` | — (re-keyed per query string) |

There is no shared query-key factory/constants module — keys are inlined as
literal arrays at each call site, so renaming a resource requires touching
every usage.
