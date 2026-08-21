# Progress Report

Snapshot of Tabi's build status. Update this alongside [CHANGELOG.md](CHANGELOG.md)
whenever a feature moves between Done / In Progress / Backlog.

_Last updated: 2026-08-21_

## Overview

Tabi is a group trip-planning app combining WhatsApp-style group chat,
Splitwise-style expense splitting, and live location sharing. NestJS 9 +
Prisma/Postgres backend, Next.js 16 + React 19 frontend. See
`backend/HIGH_LEVEL_DESIGN.md` / `frontend/HIGH_LEVEL_DESIGN.md` for architecture.

## Done

- **Auth** — phone/OTP signup + login, JWT access + refresh token flow.
- **Groups** — creation, membership, member-status updates, archive/unarchive.
- **Chat** — real-time via Socket.IO, with sender avatars, date separators,
  message grouping, optimistic send, image messages, and auto-scroll.
- **Expenses** — full Splitwise-style add flow: all six split types
  (equal/unequal/percentage/shares/adjustment/itemized), multiple payers,
  subset selection, categories, notes, receipts, recurring flag, multi-currency,
  saved split rules. Plus a detail view with the per-person breakdown.
- **Contacts** — debounced search for adding members.
- **Profile** — editable profile, theme toggle, logout, delete account.
- **Location** — per-trip location sharing (backend + frontend), opt-in per
  member and toggleable from both the Map tab and Trip info.
- **Map & itinerary** — MapLibre + MapTiler map with place search, dropped pins,
  and saved places typed as start / stop / destination. Visit order is solved
  client-side (nearest-neighbour + 2-opt, `lib/route-order.ts`) and drawn as a
  route line with numbered pins. The same itinerary renders inside Trip info,
  where any point can be opened for details or handed to the device's
  navigation app for directions.
- **Design system** — oklch token palette (light + dark), typographic scale,
  shared primitives. No hardcoded colours left in feature code.
- **Responsive** — mobile bottom-tabs, tablet icon rail, desktop sidebar +
  two-pane list/detail.

## Backlog / Known Gaps

- **Profile & group photo upload.** The `/uploads` endpoint exists and
  `Group.photoUrl` is in the schema, but `User` has **no photo column** — a
  Prisma migration is needed before profile avatars can be wired up. Avatars are
  deterministic-tinted initials for now.
- **Recurring expenses store the flag only.** There's no scheduled job creating
  future occurrences.
- **OTP delivery** — Twilio is a dependency but the code is logged, not sent.
  Also enforces a 2-minute resend cooldown, which is easy to hit while testing.
- **CUSTOM split type** is defined in the enum but throws `BadRequestException`.
- **Not yet built despite backend support**: balance summaries and settle-up
  (`GET /balances`, `POST /settlements/:receiverId`), partial settlements,
  expense edit/delete UI (`PATCH`/`DELETE`), activity/history log
  (`GET /activity`), and equalize-on-new-member (`POST /equalize/:memberId`).
- No automated test suite. Verification is currently a Playwright script driving
  the real app.

## Maintenance notes

- When a feature crosses from Backlog → In Progress → Done, move its line here
  rather than leaving stale status in old commit messages.
- Pair every entry here with a corresponding [CHANGELOG.md](CHANGELOG.md) entry
  once the underlying work actually lands.
