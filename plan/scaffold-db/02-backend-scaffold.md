---
phase: 2
title: Backend scaffold
plan: scaffold-db
status: done
depends_on: [1]
execution: workflow
---

## Goal
Generate the NestJS 11 backend in `backend/`, install runtime dependencies, initialize
Prisma, and wire `@nestjs/config` with env validation so the app fails fast on bad config
and boots on `:3000` under the `/api` prefix.

## Context & files
- Read: `docs/PLAN.md` §3 (scaffold commands) and §4 (env var table); `.env` (Phase 1).
- `backend/` currently holds only `README.md` — scaffold into it without losing the README.
- Create (via generators + by hand): `backend/package.json`, `backend/src/main.ts`,
  `backend/src/app.module.ts`, `backend/src/config/env.validation.ts` (validation),
  `backend/prisma/schema.prisma` (placeholder from `prisma init`; replaced in Phase 3).
- Test runner: NestJS ships Jest (`npm test`, `npm run test:e2e`).

## Steps
1. Preserve the stub: move `backend/README.md` aside, then
   `npx @nestjs/cli@latest new backend --package-manager npm --strict`; restore/merge the
   README afterward. Pin the versions the CLI installed (lockfile is source of truth).
2. `cd backend` and install runtime deps:
   `npm install @nestjs/config @nestjs/jwt @nestjs/throttler prisma @prisma/client class-validator class-transformer cookie-parser nodemailer`
   and dev types: `npm install -D @types/cookie-parser @types/nodemailer`.
   (JWT/throttler/nodemailer are installed now for later phases; only `@nestjs/config` is
   wired here.)
3. `npx prisma init --datasource-provider mysql`. Keep the root `.env` as the single source
   of truth for `DATABASE_URL` (don't duplicate secrets into `backend/.env`).
4. Add `src/config/env.validation.ts`: a `class-validator` class (or schema) covering the
   required PLAN §4 vars (NODE_ENV, API_PORT, APP_URL, CORS_ORIGINS, DATABASE_URL, JWT_*,
   *_TTL, COOKIE_*, SMTP_*, MAIL_FROM, THROTTLE_*). Register with
   `ConfigModule.forRoot({ isGlobal: true, validate })` in `app.module.ts`.
5. In `main.ts`: read port from config (`API_PORT`, default 3000) and
   `app.setGlobalPrefix('api')` (PLAN local-dev shows `http://localhost:3000/api`).
6. Confirm `npm run start:dev` boots on `:3000`.

## Tests
- Keep the generated `src/app.controller.spec.ts` green.
- Add `src/config/env.validation.spec.ts`: asserts validation **rejects** a config missing a
  required var (e.g. no `DATABASE_URL`) and **accepts** a complete valid env.
- Run: `cd backend && npm test`.

## Acceptance criteria
- [x] `backend/` is a NestJS 11 app (`package.json` shows `@nestjs/*` 11.x), README preserved.
- [x] Runtime deps installed and pinned in `package-lock.json` (prisma, @prisma/client,
      class-validator/-transformer, @nestjs/config/jwt/throttler, cookie-parser, nodemailer).
- [x] `npx prisma init` produced `backend/prisma/` with a `mysql` datasource on `DATABASE_URL`.
- [x] `ConfigModule` validates env on boot and fails fast on a missing required var.
- [x] `npm run start:dev` serves on `:3000` with the `/api` global prefix.
- [x] `npm test` is green (app smoke spec + env validation spec).

## Out of scope
Schema models (Phase 3), seed (Phase 4); auth/polls/public/notifications modules; global
`ValidationPipe`/CORS/throttler wiring (later phases / hardening); frontend.
