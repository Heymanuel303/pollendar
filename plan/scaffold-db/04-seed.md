---
phase: 4
title: Seed
plan: scaffold-db
status: done
depends_on: [3]
execution: solo
---

## Goal
Add a deterministic, re-runnable seed creating one sample creator, an open poll with 2
dates and their slots, 3 participants (one anonymous, no email), and a full response matrix
— runnable via `prisma db seed` and as part of `prisma migrate reset`.

## Context & files
- Read: `docs/DESIGN.md` §3.4 (entity fields/constraints) and §4 (worked example — mirror
  its shape so later algorithm tests can reuse the data).
- Create: `backend/prisma/seed.ts`; add `"prisma": { "seed": "tsx prisma/seed.ts" }` to
  `backend/package.json`; install a TS runner dev dep.
- Tokens: `public_token` is `Char(22)`. Pick a generator (add `nanoid`, or a
  `crypto.randomBytes` base64url helper sliced to 22).

## Steps
1. `npm install -D tsx` and add `"prisma": { "seed": "tsx prisma/seed.ts" }` to
   `backend/package.json`.
2. Write `prisma/seed.ts`, idempotent (delete the sample creator's data by unique
   `email`/token first, or upsert) and wrapped in `prisma.$transaction`:
   - **User**: `creator@example.com`, `displayName: "Alice"`.
   - **Poll**: `status: open`, `publicToken: <22-char>`, `title: "Team lunch"`,
     `timezone: "Europe/Brussels"`, `finalSlotId: null`.
   - **PollDate**: `2026-06-26` (sortOrder 0), `2026-06-27` (sortOrder 1) — `@db.Date` via
     `new Date('2026-06-26')`.
   - **PollSlot**: date1 → Lunch 12:00–13:00, Dinner 18:00–19:00; date2 → all-day
     (`isAllDay: true`, start/end `null`), Morning 10:00–11:00. `@db.Time` via
     `new Date('1970-01-01T12:00:00Z')`.
   - **Participant**: Bob (`bob@example.com`), Charlie (`email: null`, anonymous), Diana
     (`diana@example.com`) — each with a `Char(22)` token.
   - **Response**: one per (participant, slot) honoring `@@unique([participantId, pollSlotId])`,
     e.g. Bob `[available, maybe, unavailable, available]`, Charlie
     `[available, unavailable, maybe, available]`, Diana `[maybe, available, available, unavailable]`.
   - Do **not** populate `SlotTally` (computed live in v1).
3. `npx prisma db seed`; inspect in `npx prisma studio`.

## Tests
- Add `src/prisma/seed.spec.ts` (runs after seeding): assert 1 user; 1 poll (`status: open`)
  with 2 dates and 4 slots; 3 participants (2 with email, 1 `null`); 12 responses (3×4);
  the all-day slot has `startTime`/`endTime` `null` and `isAllDay: true`; one response per
  (participant, slot) pair.
- Run: `cd backend && npm test`. Confirm full reset path: `npx prisma migrate reset --force`
  ends with migrations + seed applied.

## Acceptance criteria
- [x] `backend/prisma/seed.ts` creates the user/poll/2 dates/4 slots/3 participants/12 responses
      (verified live: `users 1`, `polls(open) 1`, `dates 2`, `slots 4`, `participants 3 / null-email 1`,
      `responses 12`).
- [x] `backend/package.json` has `prisma.seed`; a TS runner (`tsx`) is a dev dep.
      **Prisma 7 note:** Prisma 7 ignores `package.json`'s `prisma.seed` — the *functional* seed
      command lives in `backend/prisma.config.ts` (`migrations.seed: "tsx prisma/seed.ts"`). The
      `package.json` key is kept for discoverability/compat; `prisma.config.ts` is authoritative.
- [x] `npx prisma db seed` runs without error and is safe to re-run (idempotent — deletes the
      sample creator by unique email, cascading the poll graph, before recreating; the spec runs
      it twice).
- [x] `npx prisma migrate reset --force` re-applies migrations cleanly. **Prisma 7 deviation:**
      `migrate reset`/`migrate dev` no longer auto-run the seed (removed in v7 — seeding is
      explicit only). The full reset path is therefore
      `npx prisma migrate reset --force && npx prisma db seed`, verified end-to-end.
- [x] Seed spec green (`npm test`): counts + anonymous-participant + all-day-slot + unique-pair
      assertions hold (`src/prisma/seed.spec.ts`, 5/5; suite 18/18).
- [x] The seeded "Team lunch" poll is present and inspectable (`npx prisma studio`); confirmed via
      direct `count`/`findFirst` queries against the seeded graph.

## Implementation notes (Prisma 7.8 deviations)
- **Seed config location**: Prisma 7 reads the seed command from `prisma.config.ts`
  `migrations.seed`, not `package.json`'s `prisma.seed` (running `db seed` with only the latter
  errors with "No seed command configured"). Both are set; `prisma.config.ts` is the live one.
- **No auto-seed on reset**: Prisma 7 removed automatic seeding from `migrate dev`/`migrate reset`
  and there is no `--skip-seed` flag. Run `prisma db seed` explicitly after a reset.
- **Standalone driver adapter**: `seed.ts` builds its own `PrismaMariaDb(DATABASE_URL)` adapter
  (Prisma 7 has no built-in engine connection) and loads the repo-root `.env` via `dotenv`.
- **Tokens**: `public_token` (`Char(22)`) uses a `crypto.randomBytes(16).toString('base64url')`
  helper (22 chars) — no extra dep; `nanoid` was not added.

## Out of scope
`SlotTally` population; login tokens/auth sessions; email logs; the best-slot algorithm;
frontend.
