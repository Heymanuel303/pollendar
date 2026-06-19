# Pollendar — Implementation Plan

How Pollendar gets built. Pairs with [`DESIGN.md`](./DESIGN.md) (architecture, 3NF schema,
algorithm, API, flows). Scope today: scaffolding + these docs. The phases below are the
roadmap to follow after you approve the design.

---

## 1. Tech stack

| Tool                          | Version line      | Role                                            |
| ----------------------------- | ----------------- | ----------------------------------------------- |
| Node.js                       | 22 LTS            | Runtime for backend & frontend tooling          |
| PostgreSQL                    | 16 (LTS)          | Relational DB (Docker image `postgres:16`)      |
| NestJS                        | 11.x              | Backend framework (TypeScript)                  |
| Prisma / @prisma/client       | 6.x               | ORM + migrations against PostgreSQL             |
| Vue                           | 3.5.x             | Frontend framework                              |
| Vite                          | latest (6/7)      | Frontend build/dev server                       |
| **Tailwind CSS**              | **4.x (v4.3)**    | Styling — **web-verified** setup (see §3)       |
| @tailwindcss/vite             | 4.x               | Official Tailwind v4 Vite plugin                |
| Pinia                         | 3.x               | Frontend state                                  |
| vue-router                    | 4.x               | Frontend routing                                |
| class-validator / -transformer| 0.14.x / 0.5.x    | DTO validation                                  |
| @nestjs/jwt, @nestjs/config, @nestjs/throttler | 11-compatible | Sessions, config, rate limiting    |
| nodemailer                    | 6.9.x+ / 7.x      | SMTP email sending                              |
| Mailpit                       | latest            | Dev catch-all SMTP + web UI (`axllent/mailpit`) |

> **On versions:** the Tailwind v4 + Vite setup in §3 was confirmed against the official
> docs (v4.3 line). The other rows are the current stable major lines as of **June 2026**;
> `npm create vue@latest` and `nest new` install the latest at scaffold time, so **pin the
> exact versions from the generated lockfile** rather than hard-coding minors here.

---

## 2. Repository layout

```
pollendar/
├── docker-compose.yml          # ✅ exists — PostgreSQL 16 + Mailpit
├── .env.example                # ✅ exists — all env vars
├── .gitignore                  # ✅ exists
├── README.md                   # ✅ exists
├── docs/
│   ├── DESIGN.md               # ✅ exists
│   └── PLAN.md                 # ✅ exists (this file)
├── backend/                    # ⬜ Phase 0 — NestJS app
│   ├── prisma/
│   │   ├── schema.prisma       #     (schema from DESIGN.md §3.4)
│   │   └── seed.ts
│   └── src/
│       ├── prisma/             #     PrismaModule + PrismaService (global)
│       ├── config/             #     env validation
│       ├── auth/               #     magic link, sessions, guards
│       ├── polls/              #     poll CRUD, complete, invite message
│       ├── public/             #     public poll fetch + response submit
│       ├── responses/          #     tally / best-slot computation
│       ├── notifications/      #     mailer + completion emails
│       └── main.ts
└── frontend/                   # ⬜ Phase 0 — Vue 3 + Vite
    └── src/
        ├── router/             #     routes from DESIGN.md §8
        ├── stores/             #     authStore, pollStore, publicPollStore
        ├── views/              #     Landing, Dashboard, PollEditor, PollManage,
        │                       #       PublicPoll, PublicThanks, AuthCallback
        ├── components/         #     EmailGate, DateSlotEditor, AvailabilityGrid,
        │                       #       ResultsTable, BestSlotBadge, ShareBox
        ├── assets/main.css     #     @import "tailwindcss";
        └── main.ts
```

✅ = created now · ⬜ = generated in Phase 0.

---

## 3. Phase 0 scaffolding commands

> Listed for reference — **not run yet**. They execute in Phase 0 after design approval.

**Infra**

```bash
cp .env.example .env
docker compose up -d            # PostgreSQL :5432, Mailpit SMTP :1025 / UI :8025
```

**Backend (NestJS + Prisma)**

```bash
npx @nestjs/cli@latest new backend --package-manager npm --strict
cd backend
npm install @nestjs/config @nestjs/jwt @nestjs/throttler \
  prisma @prisma/client class-validator class-transformer \
  cookie-parser nodemailer
npm install -D @types/cookie-parser @types/nodemailer
npx prisma init --datasource-provider postgresql
# → paste schema from DESIGN.md §3.4 into prisma/schema.prisma
npx prisma migrate dev --name init
```

**Frontend (Vue + Vite + Tailwind v4)**

```bash
cd ..
npm create vue@latest frontend     # select: TypeScript, Router, Pinia
cd frontend
npm install
npm install tailwindcss @tailwindcss/vite      # ← web-verified Tailwind v4 install
```

Wire Tailwind v4 (the **verified** v4 way — Vite plugin + single CSS import, no
`tailwind.config.js`, no PostCSS, no `@tailwind` directives):

```ts
// frontend/vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
})
```

```css
/* frontend/src/assets/main.css */
@import "tailwindcss";
```

```ts
// frontend/src/main.ts  — ensure the CSS is imported
import './assets/main.css'
```

---

## 4. Environment variables

Mirror of `.env.example`. Backend loads these via `@nestjs/config` with a validation
schema.

| Variable                         | Example                                          | Purpose                          |
| -------------------------------- | ------------------------------------------------ | -------------------------------- |
| `NODE_ENV`                       | `development`                                    | Mode                             |
| `API_PORT`                       | `3000`                                           | NestJS port                      |
| `APP_URL`                        | `http://localhost:5173`                          | Frontend origin (link building)  |
| `CORS_ORIGINS`                   | `http://localhost:5173`                          | Allowed credentialed origins     |
| `DATABASE_URL`                   | `postgresql://pollendar:pollendar@localhost:5432/pollendar` | Prisma connection     |
| `POSTGRES_DB/USER/PASSWORD`      | `pollendar`                                      | docker-compose PostgreSQL init   |
| `JWT_ACCESS_SECRET`              | (random)                                         | Signs access JWT                 |
| `JWT_REFRESH_SECRET`             | (random)                                         | Signs/derives refresh token      |
| `ACCESS_TOKEN_TTL`               | `15m`                                            | Access cookie lifetime           |
| `REFRESH_TOKEN_TTL`              | `30d`                                            | Refresh session lifetime         |
| `MAGIC_LINK_TTL`                 | `15m`                                            | Magic-link token lifetime        |
| `COOKIE_DOMAIN` / `COOKIE_SECURE`| `localhost` / `false`                            | Cookie scope (Secure in prod)    |
| `SMTP_HOST/PORT/SECURE`          | `localhost` / `1025` / `false`                   | SMTP (Mailpit in dev)            |
| `MAIL_FROM`                      | `Pollendar <no-reply@pollendar.local>`           | From header                      |
| `THROTTLE_TTL` / `THROTTLE_LIMIT`| `60` / `10`                                      | Rate-limit window / max          |

---

## 5. Phased roadmap

Each phase is independently runnable and leaves a working app. Order matters — each builds
on the previous.

### Phase 0 — Scaffold & infra
- **Goal:** runnable skeleton.
- **Deliverables:** docker-compose up; NestJS app; Prisma initialized; Vue+Vite app;
  Tailwind v4 wired; `.env`.
- **Acceptance:** `docker compose up` healthy; `nest start --watch` serves on :3000; Vue
  dev server on :5173 renders a Tailwind-styled page; `npx prisma db pull`/`migrate`
  connects to PostgreSQL.

### Phase 1 — Database schema + Prisma + migrations + seed
- **Goal:** the 3NF schema live.
- **Deliverables:** `schema.prisma` from DESIGN §3.4; initial migration; `PrismaModule`/
  `PrismaService` (global); `prisma/seed.ts` creating a sample user + poll + dates/slots.
- **Acceptance:** `prisma migrate dev` applies cleanly; generated tables match the ERD;
  seed runs; a quick `prisma studio` shows the sample poll.

### Phase 2 — Creator magic-link auth
- **Goal:** passwordless sign-in.
- **Deliverables:** `AuthModule` (request-link, verify, refresh, me, logout); SHA-256
  token hashing; `auth_sessions`; httpOnly cookies; `@nestjs/throttler` on magic-link;
  nodemailer → Mailpit; an auth guard.
- **Acceptance:** request a link → it appears in Mailpit → verify sets cookies →
  `/auth/me` returns the user → logout revokes; magic-link always returns 200; rate limit
  triggers.

### Phase 3 — Poll CRUD (dates + slots)
- **Goal:** creators build polls.
- **Deliverables:** `PollsModule` create/list/get/update/delete with nested dates+slots
  DTOs; ownership guard; opaque `public_token` generation; `GET /polls` lists the
  creator's own polls (retrievability).
- **Acceptance:** authenticated creator creates a poll with multiple dates and slots,
  lists only their polls, edits while `open`, deletes.

### Phase 4 — Public poll page + response submission
- **Goal:** participants respond.
- **Deliverables:** `PublicModule` — `GET /public/polls/:token` (no emails leaked);
  `POST .../responses` creating participant + responses in a transaction; `UNIQUE`
  enforcement (one answer per slot; one email per poll); optional email handling;
  participant token for later edits.
- **Acceptance:** anonymous user submits availability; duplicate email in same poll → 409;
  missing email still succeeds.

### Phase 5 — Best date/slot computation
- **Goal:** the winner, recomputed on every submit.
- **Deliverables:** aggregation query (DESIGN §4); deterministic tie-breaking; optional
  `slot_tallies` cache updated in the submission transaction; `GET .../results`.
- **Acceptance:** results endpoint returns correct per-slot tallies and best slot; a unit
  test reproduces the worked example (A wins the A/B tie); best updates after each submit.

### Phase 6 — Completion + notifications + invite message
- **Goal:** close the loop.
- **Deliverables:** `POST /polls/:id/complete` (set `final_slot_id`, `completed_at`);
  `NotificationsModule` emailing **only** participants with an email; `email_log`
  idempotency via `UNIQUE(poll_id, participant_id, type)`; `GET /polls/:id/invite-message`
  template (DESIGN §7).
- **Acceptance:** completing a poll emails only participants with emails (verified in
  Mailpit); a poll with no participant emails sends **zero** emails; re-completing doesn't
  double-send; invite message renders with the share link.

### Phase 7 — Frontend build-out
- **Goal:** the full UI.
- **Deliverables:** routes & views (DESIGN §8); Pinia stores wired to the API with cookie
  credentials; `AuthCallback` handling `?token=`; `DateSlotEditor`, `AvailabilityGrid`,
  `ResultsTable` + `BestSlotBadge`, `ShareBox` (copy link + copy invite); Tailwind styling.
- **Acceptance:** end-to-end through the UI — sign in via link, create a poll, share, vote
  as a participant in another browser, watch the best update, complete and see the email.

### Phase 8 — Hardening & run/deploy
- **Goal:** production-readiness basics.
- **Deliverables:** global `ValidationPipe` + exception filter; CORS; throttling on
  submissions; Prisma-error → HTTP mapping; unit tests (algorithm, auth) + e2e (happy
  paths) on a test DB; production cookie flags (`Secure`, prod domain); brief deploy notes
  (build images, run migrations with `prisma migrate deploy`).
- **Acceptance:** `npm test` + e2e green; validation rejects malformed bodies; security
  checklist (httpOnly cookies, hashed tokens, anti-enumeration, CORS) satisfied.

---

## 6. Local development

```bash
# 1. Infra
cp .env.example .env
docker compose up -d            # PostgreSQL :5432 · Mailpit UI http://localhost:8025

# 2. Backend
cd backend
npx prisma migrate dev          # apply migrations (Phase 1+)
npm run start:dev               # http://localhost:3000/api

# 3. Frontend
cd ../frontend
npm run dev                     # http://localhost:5173
```

- **Magic links & result emails:** open Mailpit at **http://localhost:8025** — every
  outbound email lands there in dev; click the link inside to sign in.
- **Inspect data:** `cd backend && npx prisma studio`.
- **Reset DB:** `npx prisma migrate reset` (re-runs migrations + seed).

---

## 7. Testing strategy

| Layer        | What                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| Unit         | Best-slot algorithm (scoring + tie-breaking, incl. the worked example); magic-link token hashing/expiry. |
| Service      | Poll CRUD ownership rules; one-answer-per-slot and one-email-per-poll constraints; notification recipient selection (only participants with emails; none → none). |
| e2e (Nest)   | Auth happy path (request → verify → me → logout) and full poll lifecycle against a disposable test PostgreSQL schema. |
| Frontend     | Component tests for `AvailabilityGrid` and `ResultsTable`; an optional Playwright happy-path once the UI stabilizes. |

---

Back to [`DESIGN.md`](./DESIGN.md) · [`../README.md`](../README.md).
