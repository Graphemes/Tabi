# Changelog

All notable changes to Tabi (backend + frontend) are logged here, newest first.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
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
  about visit order. Stop pins are numbered like destination pins, and both
  numbers are that place's position in the itinerary (previously destinations
  were numbered among themselves and stops not at all).
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
