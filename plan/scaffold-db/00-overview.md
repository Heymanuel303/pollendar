---
plan: scaffold-db
title: Scaffold & Database Foundation
created: 2026-06-17
status: done
layers_explored: []
phases: 4
---

## Goal
Stand up Pollendar's runnable foundation: local infra (MySQL 8.4 + Mailpit), a booting
NestJS 11 backend with validated config, the 3NF Prisma schema applied via an initial
migration behind a global Prisma module, and a deterministic seed. Covers PLAN.md Phase 0
(backend portion) + Phase 1; the Vue/Vite/Tailwind frontend scaffold is deferred to a
separate plan.

## Context
Pre-scaffold repo. Grounding lives in docs, not code:
- `docs/DESIGN.md` §3.4 — verbatim `schema.prisma` (4 enums, 10 models, all
  `@map`/`@db`/`@@unique`/`@@index`, circular `FinalSlot` relation) — the source of truth
  for Phase 3.
- `docs/PLAN.md` §3 (scaffold commands), §4 (env var table) — source for Phases 1–2.
- `docker-compose.yml` — MySQL `:3306` + Mailpit (`:1025` SMTP / `:8025` UI).
- `.env.example` — full env template (DATABASE_URL, JWT, SMTP, throttle…).
- `backend/`, `frontend/` exist but contain only `README.md`; no manifests/lockfiles/tests
  yet — the test runner (Jest) arrives with the NestJS scaffold in Phase 2.

## Phases
| # | title | depends on | execution | goal |
|---|-------|-----------|-----------|------|
| 1 | Infra up | — | solo | `.env` + `docker compose up` (MySQL + Mailpit) healthy |
| 2 | Backend scaffold | 1 | workflow | NestJS 11 app + deps + `@nestjs/config` validation; boots on `:3000/api` |
| 3 | DB schema + migration | 2 | workflow | `schema.prisma` from DESIGN §3.4 + `migrate dev` + global Prisma module |
| 4 | Seed | 3 | solo | `prisma/seed.ts` sample data; `db seed` + `migrate reset` run clean |

## Global acceptance criteria
- `docker compose ps` shows MySQL + Mailpit healthy.
- `cd backend && npm run start:dev` boots on `:3000` with `/api` prefix and validated env.
- `npx prisma migrate status` is clean; all 10 snake_case tables exist with their
  unique/index constraints.
- `npx prisma migrate reset --force` re-applies migrations + seed end-to-end.
- `cd backend && npm test` is green across all phases' added specs.
- Each phase file ends `status: done` with acceptance boxes ticked.

## Risks & open questions
- `nest new backend` into a non-empty dir (`backend/README.md` exists) — Phase 2 moves the
  README aside and restores it.
- MySQL `@db.Time`/`@db.Date` round-tripping in Prisma — Phase 4 pins construction
  conventions (`new Date('1970-01-01T12:00:00Z')` for Time, `new Date('2026-06-26')` for
  Date).
- `BigInt`→JSON serialization (DESIGN note, lines 477–479) — deferred to API phases; not
  needed for scaffold/DB.
- `SlotTally` is optional in v1 (DESIGN §3.2): table is created (it's in §3.4) but the seed
  does not populate it — tallies are computed live.
- Public/participant tokens are `Char(22)` nanoids — Phase 4 picks the generator (`nanoid`
  dep vs `crypto` helper).
