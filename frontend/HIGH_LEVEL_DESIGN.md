# Tabi Frontend — High-Level Design

## 1. Purpose

The frontend is a mobile-first web client ("TripShare") for the Tabi backend:
phone/OTP login, browsing trip groups, group chat, expense tracking/splitting,
and a live-location tab. It's built as a single-page app shell rendered by
Next.js, styled to look like a native mobile app (max-width phone frame,
bottom tab bar).

## 2. Tech Stack

| Concern            | Choice                                          |
|---------------------|--------------------------------------------------|
| Framework           | Next.js 16 (App Router, Turbopack)                |
| UI library          | React 19                                          |
| Language            | TypeScript                                        |
| Styling             | Tailwind CSS v4 + shadcn/ui (`base-nova` style) components |
| Server-state cache  | TanStack Query (React Query) v5                  |
| Client/local state  | Zustand                                           |
| Forms + validation  | react-hook-form + zod (`@hookform/resolvers`)     |
| HTTP client         | axios, with a token-refresh interceptor           |
| Real-time transport | socket.io-client                                  |
| Icons               | lucide-react                                      |

Entry point: [src/app/layout.tsx](src/app/layout.tsx) wraps everything in
`AppProviders` (React Query only); [src/app/page.tsx](src/app/page.tsx) renders
a single component, `TripShareShell`, which owns essentially the entire app —
this is a client-rendered SPA hosted inside one Next.js route, not a
multi-page App Router app.

## 3. Architectural Style

**Single-shell, client-state-driven SPA.** There is effectively one route
(`/`). `TripShareShell` ([src/features/tripshare/tripshare-shell.tsx](src/features/tripshare/tripshare-shell.tsx))
handles authentication gating, tab navigation, and overlay/modal navigation
entirely with local `useState`, not the Next.js router — "screens" are
conditionally rendered React components, not URL-addressable pages.

```
┌───────────────────────────────────────────────────────────┐
│ app/layout.tsx  → AppProviders (QueryClientProvider)        │
│   app/page.tsx  → <TripShareShell />                        │
│                                                               │
│   TripShareShell (auth gate + tab/overlay router)            │
│     ├─ not authenticated → phone + OTP login UI               │
│     └─ authenticated:                                        │
│          tabs: MyTrips | ExpensesView | MapView | ChatView    │
│          overlays: CreateNewGroup | ProfilePage | AddExpense  │
└───────────────────────────────────────────────────────────┘
        │                                   │
        ▼                                   ▼
 lib/http.ts (axios + interceptor)   lib/socket.ts (socket.io-client)
        │                                   │
        ▼                                   ▼
   Backend REST API (:3001)          Backend /realtime namespace (:3001)
```

State is layered:
- **Server state** (groups, messages, expenses, profile) → TanStack Query,
  keyed by resource (`["groups"]`, `["groups", id, "expenses"]`,
  `["groups", id, "messages"]`, `["profile", userId]`, `["discover", query]`).
- **Session/auth state** (tokens, current user) → a Zustand store
  ([src/store/auth-store.ts](src/store/auth-store.ts)) backed by
  `localStorage`, read by both the HTTP client and the socket client.
- **UI/navigation state** (active tab, selected group, open overlay, form
  inputs) → local component `useState`, not centralized.

## 4. Data Flow

1. **Auth**: user enters a phone number → `POST /auth/request-otp` → enters
   OTP → `POST /auth/verify-otp` → access/refresh tokens + user are stored in
   `useAuthStore` (and mirrored to `localStorage`).
2. **REST reads**: feature components call typed functions in
   `src/features/whatsapp/api.ts` (the de facto API client module, despite the
   directory name) through TanStack Query hooks; the axios instance attaches
   `Authorization: Bearer <accessToken>` automatically.
3. **Token refresh**: on any `401` (other than the refresh call itself), the
   axios response interceptor transparently calls `/auth/refresh`, updates the
   store, retries the original request, and queues concurrent requests while
   the refresh is in flight (see [LOW_LEVEL_DESIGN.md](LOW_LEVEL_DESIGN.md) §3).
4. **Real-time**: `lib/socket.ts` exposes a singleton Socket.IO client
   authenticated with the current access token. `ChatView` connects on mount,
   listens for `message:new`, and writes new messages directly into the
   React Query cache via `queryClient.setQueryData` (no separate socket
   store) — REST fetch and socket push share the same cache entry per group.
5. **Mutations**: expense/group/profile writes go through
   `useMutation`, then invalidate the relevant query key so the next read is
   fresh (e.g. creating an expense invalidates `["groups", id, "expenses"]`).

## 5. Feature Modules

| Path | Role |
|---|---|
| `features/tripshare/` | The actual app: shell, tab screens (`my-trips`, `expenses-view`, `map-view`, `chat-view`), overlays (`create-new-group`, `profile-page`, `add-expense`) |
| `features/whatsapp/api.ts` | Central REST API client (auth, contacts, groups, messages, expenses, profile) |
| `features/whatsapp/chat-store.ts` | **Unused/legacy** in-memory mock chat store (seeded demo data) — not wired into `TripShareShell`; superseded by `api.ts` + React Query. Candidate for deletion. |
| `features/auth/` | A second, smaller email/password login path (`login-card.tsx`, `login-schema.ts`, `api/login.ts`) — not the flow used by `TripShareShell` (which does phone+OTP), appears to be an earlier/alternate entry point |
| `features/realtime/components/socket-status.tsx` | Standalone connection-status indicator, not currently mounted in the shell |
| `features/query/components/query-health.tsx` | Dev/diagnostic component for React Query state |
| `lib/` | Cross-cutting clients: `http.ts` (axios), `socket.ts` (socket.io), `env.ts`, `query-client.ts`, `utils.ts` |
| `store/auth-store.ts` | Zustand session store |
| `components/ui/` | shadcn-generated primitives (`button`, `card`, `input`, `label`) |
| `types/` | Shared TS types mirroring backend shapes (`message.ts`, `location.ts`, `group-events.ts`) |

## 6. Styling System

Tailwind CSS v4 with a hand-rolled mobile-app palette (hex literals like
`#003535`, `#FE6B00`, `#F8F9FF` used directly in `className`, not design
tokens), plus shadcn/ui (`components.json`, `base-nova` style, `neutral` base
color) for primitive components. The whole app is constrained to
`max-w-[430px]` to read as a phone screen even in a desktop browser.

## 7. Environment / Configuration

[src/lib/env.ts](src/lib/env.ts) reads two public env vars with local-dev
fallbacks:
- `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:3001`)
- `NEXT_PUBLIC_SOCKET_BASE_URL` (default `http://localhost:3001`)

## 8. Known Gaps / Non-Functional Notes

- No routing — deep-linking to a specific group/tab/overlay isn't possible;
  a page refresh always lands back on the "Groups" tab.
- Two parallel, disconnected auth surfaces exist (`features/auth` email/password
  vs. the shell's phone+OTP flow); only the latter is reachable from `page.tsx`.
- `features/whatsapp/chat-store.ts` is dead code (mock data, no imports outside itself).
- `AddExpense`'s category picker sends values (`FOOD_AND_DRINK`,
  `TRANSPORTATION`, `ACCOMMODATION`, `HEALTHCARE`) that don't match the
  backend's `ExpenseCategory` enum (`FOOD`, `TRANSPORT`, `STAY`, no
  `HEALTHCARE`); the backend's `@IsEnum` validation plus
  `forbidNonWhitelisted` will reject these — see frontend LLD §6 and backend
  LLD §1.
- No error boundary / global toast system; errors surface ad hoc via inline
  `isError`/`error.message` checks per mutation.
- `AddExpense` builds its request with a raw `http.post(...)` call instead of
  going through `features/whatsapp/api.ts`, so the expense-creation endpoint
  is defined in two places.
