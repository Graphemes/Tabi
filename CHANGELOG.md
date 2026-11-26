# Changelog

All notable changes to Tabi (backend + frontend) are logged here, newest first.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Security
- **Access tokens were signed with a public default key.** `JWT_SECRET` was
  never set, so every module fell back to the hard-coded `'your-secret-key'`.
  Anyone reading the source could mint a valid token for any user. Both JWT
  secrets are now required, and the backend refuses to start without them
  (`common/config/required-env.ts`).
- **`backend/.env` was committed to this public repo**, including
  `JWT_REFRESH_SECRET`. It is now untracked and ignored, the refresh secret has
  been rotated, and `backend/.env.example` documents the variables. The old
  value stays in git history, so treat it as compromised. Existing sessions
  must log in again.
- `.env` is now loaded explicitly before any module reads it (`load-env.ts`).
  Until now it reached `process.env` only because Prisma's client happened to
  be imported first.

### Fixed
- **A fresh database couldn't be built from the migrations.** Everything that
  reached the dev database through `prisma db push` between `add_groups` and
  `add_saved_places` (Message, Expense and its children, Settlement,
  LiveLocation, ActivityLog, SavedSplitRule, OtpCode, Contact, and the
  User/Group/GroupMember column changes) was never captured, so
  `migrate deploy` failed on `relation "Message" does not exist`. A baseline
  migration now fills the gap: a new database built from migrations alone
  matches `schema.prisma` exactly. Existing databases need
  `npx prisma migrate resolve --applied 20260601000000_baseline_db_push_tables`.
- `npm run start:prod` failed with "Cannot find module dist/main". A stale,
  unused `generated/prisma` client was being compiled, which moved the build
  output to `dist/src/`. It is now excluded from the build.
- Expense validation messages kept the previous currency after switching
  currency (the memo didn't depend on it), and one still hardcoded `$0.00`.
- Lint is clean in both apps: Express request typing uses module augmentation,
  the login screen uses `useWatch` so the React Compiler can optimise it, and
  the receipt preview follows the existing user-upload `<img>` convention.
- **The backend crashed whenever someone closed one of two open tabs.** The
  gateway runs on the `/realtime` namespace, so its injected `server` is a
  `Namespace`, whose `sockets` is already the socket map. The presence check
  looked up `server.sockets.sockets`, which is `undefined`, and the uncaught
  `TypeError` in `handleDisconnect` took the whole process down. `server` is
  now typed as `Namespace`, so the compiler models this correctly.
- **Members could not see each other's live location.** Three faults stacked up:
  - The socket checked its token only at connect, and access tokens last 15
    minutes. A socket that connected with a stale token was dropped by the
    server and never reconnected, so every position emitted after that sat in a
    send buffer forever. The socket now presents the current token on every
    attempt and refreshes it and reconnects on `auth:error` (`lib/socket.ts`).
  - Positions were only sent while the Map tab or Trip info was on screen. They
    now flow from one app-wide watcher to every trip the member shares with,
    for as long as the app is open, with a 60s heartbeat so someone standing
    still doesn't look disconnected (`use-location-broadcast.ts`). Sends are
    throttled to one per 15s on the trailing edge: a move inside the window is
    held and sent when the window closes, not dropped.
  - Positions sent over HTTP were saved but never broadcast. The location
    service now announces updates and sharing toggles itself and the gateway
    relays them, whichever transport carried them. Positions are now sent over
    HTTP, so a dropped socket can no longer lose them silently.
- **Members got no realtime events for a trip they joined while online.**
  Socket rooms were joined only on connect, so a member added to a trip, or
  someone creating one, received none of its messages, place updates or live
  locations until they reloaded, and the trip didn't appear in their list. A
  removed member kept receiving them. `GroupsService` now publishes membership
  changes; the gateway moves the member's open sockets in or out of the room
  and sends `group:added` / `group:removed` so the trip list refreshes.
- Live-location pins for members with no name or username all read "Trip
  member". They now fall back to the phone number, matching the Trip info
  member list.
- **The route line stayed straight even after the road route loaded.** The map
  only redrew the line when `isStyleLoaded()` was true. That is false while
  tiles are still loading, which is when the road geometry arrives, so the
  update was skipped for good. The same check meant the map often opened zoomed
  out instead of framed on the trip. Both now use the map's one-time `load`
  state (`map-canvas.tsx`).
- Viewers also poll live locations every 30s as a fallback, and refetch when
  another member turns sharing on or off, so that member appears or disappears
  straight away.
- A stationary phone reports `NaN` heading, which the API rejected. Non-finite
  readings are now dropped before sending.
- Opening the app over plain `http://` on a LAN IP (common when testing on a
  phone) blocks geolocation without a clear error. The share controls now say
  that HTTPS or localhost is needed.
- **The route didn't follow the optimal path.** Visit order was optimised on
  straight-line distance with a nearest-neighbour + 2-opt heuristic, and drawn
  as straight segments over terrain. Order is now solved on **road driving
  time** from OSRM, **exactly** (Held–Karp) for up to 12 stops, with local
  search above that. The line follows the actual roads, and the totals show road
  km and drive time. With no source set, the route now starts at whichever stop
  is best rather than at the first stop in the list. If the routing server is
  unreachable, it falls back to straight lines and says so
  (`lib/route-order.ts`, `lib/road-routing.ts`; set `NEXT_PUBLIC_ROUTING_URL`
  to self-host OSRM).

### Added
- **Browser end-to-end suite** (`e2e/`, Playwright). Two users sign up through
  OTP, build a trip, check the road-optimised route, share live location, and
  exercise realtime delivery, the two-tab crash and stale-token recovery. It
  runs against a `tabi_e2e` database rebuilt from migrations each run.
- **Itinerary view in Trip info.** The trip's whole journey now lives in Group
  details, not just the Map tab: the computed route drawn start → stops →
  destinations, everyone's live position on the same map, and the sequence as a
  tappable list. Selecting a point shows its address, note, coordinates, who
  pinned it and its position in the itinerary.
- **Directions hand off to the device's navigation app** rather than always
  opening a Google Maps search page — Android gets a `geo:` link (so the system
  chooser offers Maps/Waze/whatever is installed), iOS gets Apple Maps, other
  platforms get Google Maps web directions (`lib/navigation-link.ts`).
- Location-sharing switch is now reachable from Trip info too, alongside a
  one-tap "Update" that pushes a fresh fix.
- **Live locations are actually live.** While sharing is on, the app watches the
  member's position and pushes moves over the socket (throttled to one emit per
  15s, one watch per trip however many map views are mounted). Previously the
  group saw wherever someone was when they last opened the map.

### Changed
- **A trip now has exactly one source and one destination**, with any number of
  stops in between. The backend rejected a second source but happily took any
  number of destinations, so the route had no defined end. Both ends are now
  singletons (`places.service.ts`), the save form greys out whichever end is
  already claimed, and the solver pins the destination last while optimising
  only the stops between the two (`lib/route-order.ts`).
- **The three route roles are now told apart by shape, not just colour**: the
  source is a green pennant, the destination a red pin carrying a white flag,
  and stops are small teal circles numbered in visit order. Previously
  destinations and stops were both numbered pins in similar colours, which was
  unreadable on the map. Lists mirror the pins, and the Itinerary section has a
  legend.
- Numbering counts stops only, so "stop 2 of 5" no longer includes the two
  endpoints in its total.
- Route order, pin numbering and list numbering come from a single
  `useTripItinerary` hook, so the Map tab and Trip info can no longer disagree
  about visit order.
- Socket-driven refetches for places and live locations are filtered by trip;
  an event for another group no longer invalidates the open one.

## 2026-08-10

### Fixed
- **The whole app was rendering in Times serif.** `globals.css` declared
  `--font-sans: var(--font-sans)` — self-referential, so it resolved to empty
  and `font-sans` fell back to the browser default. Geist was loaded but never
  wired up. Single biggest cause of the "unfinished" look.
- Chat had **no auto-scroll at all** — new messages arrived off-screen. Now
  jumps to newest on open and follows along only when already near the bottom.
- Trip list showed fake data: a literal `"Name: ..."` as the last message and an
  "active" count derived from array index. Both replaced with real data.
- `expenses-view` used `isLoading` instead of `isPending`, blanking the whole
  list on every background refetch (visible now that it's a persistent pane).
- `formatMoney` in the expense form hardcoded `$` regardless of the selected
  currency.

### Added
- **Design token system** — teal/orange brand ramps in oklch, semantic surface /
  border / money colours, radius and shadow scales, full light **and** dark
  palettes. Replaces 336 hardcoded hex literals across 25 distinct values.
- **Dark mode** with a Light/Dark/Auto toggle in the profile sheet, via
  `next-themes` (blocking script, so no flash and no hydration mismatch).
- **Responsive layout** — desktop sidebar nav plus two-pane list+detail for Chat
  and Expenses; mobile keeps bottom tabs and push navigation. Nav flips at `md`,
  panes at `lg`.
- New `ExpenseDetail` pane: full breakdown of payers, per-person owed/net,
  notes and receipt.
- Chat: sender names and avatars, date separators, consecutive-message
  grouping, optimistic send, and real image messages (Camera/Gallery were
  no-ops; they now upload via `/uploads` and send `type: IMAGE`).
- Skeleton loading states and proper empty states across trips, expenses, chat
  and contacts.
- UI primitives: `dialog`, `avatar`, `badge`, `skeleton`, `separator`, `switch`,
  `textarea`, plus app-level `ResponsiveModal` (mobile sheet → desktop dialog),
  `UserAvatar`, `MoneyText`, `EmptyState`, `ScreenHeader`.

### Changed
- Backend `groups.findAll` now includes each group's newest message so the trip
  list can show a real preview line.
- Overlays (new trip, profile, add expense) became `ResponsiveModal`s and now
  carry their own payload instead of using `selectedGroupId` as a side channel.
- Contact search in "new trip" is debounced (was one request per keystroke).
- Map tab is now an honest placeholder with working per-trip location sharing,
  rather than a grey box captioned "Map view".

### Removed
- ~1,100 lines of dead code with zero inbound imports: `whatsapp-shell.tsx`,
  `chat-store.ts`, `features/auth/**`, `features/query/**`,
  `features/realtime/**`, `ui/label.tsx`, `src/types/*`.
- The header notification bell — it had no handler and no global feed behind it.

## 2026-08-07

### Fixed
- Hydration mismatch on load, unidentified-user rendering, and stale
  trip/profile state after auth changes (`4cddb82`). Touched expense
  add/view, my-trips, profile, tripshare shell, WhatsApp API client, auth
  store, and backend activity/expenses/groups/location/messages services.

### Docs
- Added High-Level and Low-Level Design docs for both `frontend/` and
  `backend/` (`05adb19`).

## 2026-06-19

### Added
- Expense screens completed end-to-end, including a group-member status
  update endpoint on the backend (`4214f52`).

## 2026-06-17

### Added
- Floating action ("plus") button and its option menu on the trip shell;
  initial add-expense UI (`89f95db`).

## 2026-06-16

### Added
- Refresh-token auth flow (access + refresh JWTs), reworked friends
  module, and supporting Prisma schema changes (`58c9a9b`).

## 2026-06-13

### Added
- Mobile OTP login flow working end-to-end (`55661d0`).
- Profile screen and "create new group" flow (`5f081bb`).

### Fixed
- Corrected contacts API integration (`4bff1ee`).

## 2026-05-31

### Added
- Frontend project scaffolded (Next.js/TripShare shell) (`f26a6b0`).
- Core Splitwise-style features (expense splitting) and live user-location
  sharing (`6fea15d`).
- Group creation for users (`641920b`).

## 2026-03-24

### Added
- Initial project setup (`f1145f4`).
- Authentication routes: signup, login, get-profile (`67688d0`).
- First commit — repo initialized (`323cd9b`).

---

## Maintenance notes

- Add a dated entry (or add to `[Unreleased]`) whenever a change lands —
  group by day is fine for solo/low-frequency work.
- Use `Added` / `Changed` / `Fixed` / `Removed` / `Docs` subsections; drop
  ones that don't apply.
- Reference the commit hash in parentheses when known.
- Keep entries scoped to *why it matters*, not a restatement of the diff.
