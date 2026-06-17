---
phase: 3
title: DB schema + migration
plan: scaffold-db
status: done
depends_on: [2]
execution: workflow
---

## Goal
Make the 3NF schema live: replace the placeholder `schema.prisma` with the verbatim block
from DESIGN §3.4, run the initial migration against the Dockerized MySQL, and expose a
global `PrismaModule`/`PrismaService` for dependency injection.

## Context & files
- Read: `docs/DESIGN.md` §3.4 (lines 276–475 — the canonical schema), §3.2–§3.3
  (constraint/3NF rationale), and the BigInt note (lines 477–479). `.env` `DATABASE_URL`.
- Modify: `backend/prisma/schema.prisma` (replace contents with the DESIGN §3.4 block).
- Create: `backend/prisma/migrations/**` (via `migrate dev`), `backend/src/prisma/prisma.service.ts`,
  `backend/src/prisma/prisma.module.ts`; import `PrismaModule` in `app.module.ts`.

## Steps
1. Overwrite `backend/prisma/schema.prisma` with DESIGN §3.4 **verbatim**: `generator
   client` + `datasource db` (mysql, `env("DATABASE_URL")`), the 4 enums (`PollStatus`,
   `Availability`, `EmailType`, `EmailStatus`) and 10 models (`User`, `LoginToken`,
   `AuthSession`, `Poll`, `PollDate`, `PollSlot`, `Participant`, `Response`, `SlotTally`,
   `EmailLog`) with every `@map`/`@db.*`/`@@map`/`@@unique`/`@@index` and the circular
   `FinalSlot` relation (`Poll.finalSlot` ↔ `PollSlot.finalOf`, `onDelete: SetNull`).
2. `npx prisma migrate dev --name init` — generates the SQL migration, applies it to MySQL,
   and runs `prisma generate`.
3. Create `PrismaService extends PrismaClient` with `onModuleInit` → `$connect()` and
   `onModuleDestroy` → `$disconnect()`.
4. Create `@Global() PrismaModule` providing and exporting `PrismaService`; import it in
   `AppModule`.

## Tests
- Add `src/prisma/prisma.service.spec.ts` (integration; requires Phase 1 infra running):
  connect, then assert all 10 tables exist via `$queryRaw` (e.g. `SHOW TABLES`) — `users`,
  `login_tokens`, `auth_sessions`, `polls`, `poll_dates`, `poll_slots`, `participants`,
  `responses`, `slot_tallies`, `email_log`; optionally assert a couple of unique indexes.
- Run: `cd backend && npm test`. Cross-check with `npx prisma migrate status` (clean) and a
  glance in `npx prisma studio`.

## Acceptance criteria
- [x] `schema.prisma` matches DESIGN §3.4 (4 enums + 10 models, all maps/constraints/relations).
      The data model is verbatim; the generator/datasource **header** was adapted to the
      installed Prisma 7.8 toolchain (see note below) — Prisma 7 forbids `url` in the schema.
- [x] `npx prisma migrate dev --name init` applies cleanly; the migration is committed under
      `backend/prisma/migrations/` (`20260617111242_init`).
- [x] All 10 snake_case tables exist with their UNIQUE constraints
      (`users.email`, `login_tokens.token_hash`, `polls.public_token`,
      `participants(poll_id,email)`, `poll_dates(poll_id,event_date)`,
      `responses(participant_id,poll_slot_id)`, `email_log(poll_id,participant_id,type)`).
- [x] Global `PrismaModule`/`PrismaService` resolves via DI; `AppModule` imports it.
- [x] `npm test` green (Prisma connection + tables spec); `migrate status` clean.

## Implementation notes (Prisma 7.8 deviations from DESIGN §3.4)
DESIGN §3.4 predates Prisma 7. Two header-only deviations were required (the data model
— enums/models/maps/constraints/relations — is verbatim):
- **Datasource `url`**: Prisma 7 rejects `url = env(...)` in the schema (error P1012). The
  connection string lives in `prisma.config.ts` (repo-root `.env`) for the CLI, and
  `PrismaService` passes it to the runtime client via a **driver adapter** (`@prisma/adapter-mariadb`
  + `mariadb`, added as deps) — Prisma 7 removed the built-in engine connection.
- **Generator**: kept the classic `prisma-client-js` (as DESIGN §3.4 specifies) rather than
  the new ESM `prisma-client` that `prisma init` scaffolded — the new generator emits
  `import.meta`, which the CommonJS NestJS/ts-jest toolchain cannot parse.
- **Dev infra**: `migrate dev` needs a shadow DB; the app user lacked the privilege, so a
  scoped grant was applied: ``GRANT ALL PRIVILEGES ON `prisma_migrate_shadow_db_%`.* TO
  'pollendar'@'%'``. Applied to the running container; not yet codified in `docker-compose.yml`
  (recommend folding into Phase 1 infra so fresh `down -v` / `migrate reset` stay reproducible).

## Out of scope
Seed data (Phase 4); `BigInt`→string API serializer; `SlotTally` population; any domain
modules; frontend.
