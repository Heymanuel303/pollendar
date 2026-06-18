# Phase 3: Production Dockerfile and deploy notes

**Plan:** [hardening-and-deploy](00-overview.md)
**Depends on:** 01-error-handling-and-throttling.md
**Execution:** solo

## Context
This plan covers production-readiness basics for the Pollendar NestJS API: a global exception filter with centralized Prisma-error -> HTTP mapping, throttling on public response submissions, audited production cookie/anti-enumeration flags, real e2e happy-path tests on a disposable test DB plus unit-test gap-fill, and brief deploy notes. The hardening pieces are owned by earlier phases — by the time this phase runs, the global exception filter, the public-submission `@Throttle`, the e2e harness, and the prod cookie audit are ALREADY done. The base app wiring (`setGlobalPrefix('api')`, `cookieParser`, global `BigIntSerializerInterceptor`, `ValidationPipe` with `whitelist/forbidNonWhitelisted/transform`, CORS allow-list with `credentials: true`, global `ThrottlerGuard`, prod cookie flags via `cookie.util.ts`) is ALREADY wired and must not be touched. This phase adds only deploy artifacts and documentation — no application code changes.

## Objective
Add a multi-stage production Dockerfile for `backend/` and document the image build, `prisma migrate deploy` run order, and required production environment variables so the API can be deployed reproducibly.

## Files to touch
- `backend/Dockerfile` — NEW. Multi-stage build: a `builder` stage that runs `npm ci`, `npx prisma generate`, and `npm run build`; a slim `runtime` stage that copies `dist/`, production `node_modules`, the generated Prisma client, `prisma/` (schema + migrations), and `prisma.config.ts`, then runs `node dist/main`.
- `backend/.dockerignore` — NEW. Exclude `node_modules`, `dist`, `coverage`, `test`, `*.spec.ts`, `.git`, local `.env`, and other build noise from the build context.
- `backend/docker-entrypoint.sh` — NEW. Run `npx prisma migrate deploy` (idempotent) before `exec node dist/main`, so the schema is migrated before the app boots and signals propagate correctly.
- `docs/DEPLOY.md` — NEW. Production deploy guide: image build, migrate-deploy run order, required prod env table, and the production security checklist.
- `backend/README.md` — EDIT. Add a short "Production / Deploy" section linking to `../docs/DEPLOY.md`.

## Steps
1. Create `backend/.dockerignore` first so the build context stays small. Ignore at minimum: `node_modules`, `dist`, `coverage`, `.git`, `test`, `**/*.spec.ts`, `.env`, `.env.*`, `*.log`, `.eslintcache`. Do NOT ignore `prisma/` (schema + the committed `prisma/migrations/20260617111242_init` must ship in the image) or `prisma.config.ts` (Prisma 7 reads `DATABASE_URL` and the migrations path from it).
2. Create `backend/Dockerfile` as a multi-stage build pinned to Node 24 (the repo runs `node v24.11.1`); use `node:24-bookworm-slim` or `node:24-alpine` consistently across stages.
   - **builder stage:** `WORKDIR /app`; copy `package.json package-lock.json`; `RUN npm ci`; copy the rest of `backend/`; `RUN npx prisma generate` (Prisma 7 needs the client generated from `prisma/schema.prisma`); `RUN npm run build` (emits `dist/`).
   - **runtime stage:** `WORKDIR /app`; set `ENV NODE_ENV=production`; copy `package.json package-lock.json`; `RUN npm ci --omit=dev`; copy `--from=builder /app/dist ./dist`, `/app/prisma ./prisma`, `/app/prisma.config.ts ./prisma.config.ts`, and the generated Prisma client output from `/app/node_modules/.prisma` and `/app/node_modules/@prisma/client` (ensures the engine/client generated in the builder is present at runtime). Keep the `mariadb` driver and `@prisma/adapter-mariadb` in production deps — Prisma 7 connects through the adapter (`src/prisma/mariadb-adapter.ts`), not a bundled engine, and `prisma` CLI is needed for `migrate deploy`.
   - `EXPOSE 3000` (default `API_PORT`); `COPY docker-entrypoint.sh` and `RUN chmod +x`; `ENTRYPOINT ["./docker-entrypoint.sh"]`.
3. Create `backend/docker-entrypoint.sh`: a `#!/bin/sh` script that runs `npx prisma migrate deploy` then `exec node dist/main`. Note in a comment that `migrate deploy` is the only safe prod migration command (never `migrate reset` / `migrate dev`, both destructive) and that the seed (`tsx prisma/seed.ts`) is NOT run in production. `exec` so `node` becomes PID 1 and receives SIGTERM for graceful shutdown.
4. Create `docs/DEPLOY.md` with these sections:
   - **Build:** `docker build -t pollendar-api:<tag> ./backend` (build context is `backend/`).
   - **Run order:** the entrypoint runs `npx prisma migrate deploy` (applies committed migrations from `prisma/migrations/`, idempotent) BEFORE `node dist/main`. If migrations are run as a separate job/step instead of the entrypoint, document that ordering explicitly: migrate first, then start.
   - **Required prod env** table (these are the validated vars from `src/config/env.validation.ts`; the app fails fast on boot if any required one is missing/invalid):
     - `NODE_ENV=production`
     - `API_PORT` (e.g. `3000`)
     - `APP_URL` — public API/base URL
     - `CORS_ORIGINS` — comma-separated allow-list of the real frontend origin(s); never `*` (CORS uses `credentials: true`)
     - `DATABASE_URL` — MySQL 8.4 connection string; consumed by both the app and `prisma.config.ts`
     - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — strong unique secrets (inject via secret manager, not the image)
     - `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `MAGIC_LINK_TTL` — duration strings like `15m` / `30d`
     - `COOKIE_SECURE=true` — required for HTTPS-only cookies in prod
     - `COOKIE_DOMAIN` — the real registered domain (leave UNSET for host-only cookies; never an IP literal per RFC 6265)
     - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` — real SMTP relay
     - `THROTTLE_TTL` (seconds), `THROTTLE_LIMIT`
   - **Secrets:** inject `JWT_*`, `DATABASE_URL`, and `SMTP_*` at runtime via env/secret manager; never bake into the image or commit to `.env`. Note the local `.env` is git-ignored and excluded by `.dockerignore`.
   - **Production security checklist** (already enforced in code by prior phases / existing wiring — this documents what to verify in a prod env): `COOKIE_SECURE=true`; httpOnly + `sameSite: 'lax'` cookies (`src/auth/cookie.util.ts`); `CORS_ORIGINS` is an explicit allow-list, never `*`; magic-link request stays anti-enumeration (always `200 { ok: true }`); public poll fetch never leaks participant emails; global exception filter prevents Prisma-internal leakage in error responses.
5. Edit `backend/README.md`: add a short "## Production / Deploy" section after "Tests" pointing to `../docs/DEPLOY.md` and noting the image is built from `backend/` and that `prisma migrate deploy` runs on container start. (Optional: the README header still says "Prisma 6" — leave that for a separate doc-fix; do not expand scope here.)

## Verification
- `docker build -t pollendar-api:test ./backend` succeeds from the repo root (validates the multi-stage build, `prisma generate`, and `nest build`).
- From `backend/`: `npm run build` succeeds (sanity that `dist/main` exists for the runtime CMD; no app code changed so it must still pass).
- From `backend/`: `npm run lint` passes (no `.ts` touched, but confirms the tree is clean).
- Manual: `docker run --rm -e NODE_ENV=production pollendar-api:test node dist/main` fails fast with the env-validation error (proves required-var validation is intact in the image); with a full env + reachable MySQL, the entrypoint runs `prisma migrate deploy` then serves `/api` on `API_PORT`.

## Acceptance
- [x] `docker build ./backend` produces a runnable image whose entrypoint runs `npx prisma migrate deploy` before `node dist/main`, and `docs/DEPLOY.md` documents the build command, that run order, the required prod env vars (incl. `COOKIE_SECURE=true`, `COOKIE_DOMAIN`, `CORS_ORIGINS`, JWT/SMTP secrets), and the production security checklist (httpOnly/secure cookies, anti-enumeration magic-link, no email leakage, explicit CORS allow-list).
