# Hardening & run/deploy (Phase 8)

**Slug:** `hardening-and-deploy` (folder: `docs/plans/2026-06-18-hardening-and-deploy/`)
**Created:** 2026-06-18
**Status:** completed

## Goal
Production-readiness basics for the Pollendar backend (NestJS 11 / Prisma 7 / MySQL 8.4): centralize error handling, throttle the public submission endpoint, lock down production cookie/anti-enumeration flags, add real e2e happy-path coverage on a disposable test DB, and document how to build images and run migrations. This closes out the implementation roadmap in [`../../PLAN.md`](../../PLAN.md) §5 Phase 8.

## Scope
- **backend/src/common**: new global exception filter centralizing `Prisma.PrismaClientKnownRequestError` → HTTP mapping (P2002→409, P2025→404, P2003→409, else→500) as a safety net, registered via `useGlobalFilters` in `main.ts`.
- **backend/src/public**: add `@Throttle` to the public `POST polls/:token/responses` submit handler.
- **backend/src/auth/cookie.util.ts**: audit (not rebuild) prod cookie flags + anti-enumeration behavior against a checklist.
- **backend/test + select src/\*\*/\*.spec.ts**: disposable test-DB e2e harness, auth + poll-lifecycle happy-path e2e flows, and unit gap-fill (best-slot tie-break, auth token hashing/expiry).
- **backend/ + docs/**: multi-stage production `Dockerfile`, `.dockerignore`, migrate-deploy entrypoint, `docs/DEPLOY.md`, README deploy link.

## Out of scope
- Frontend changes, Playwright, and component tests — already delivered in Phase 7; Phase 8 testing is backend unit + e2e only.
- Re-wiring `ValidationPipe`, CORS allow-list, the global `ThrottlerGuard`, or the `BigIntSerializerInterceptor` — these are **already implemented** in `main.ts`/`app.module.ts`; phases build on them, not rebuild them.
- New product features; CI/CD pipeline definition; choosing a specific hosting platform (deploy notes stay generic Docker + `prisma migrate deploy`).

## Constraints
- Do not regress existing wiring: validation, CORS, throttler, prod cookies, BigInt serialization are live.
- Magic-link request MUST keep returning 200 regardless of email existence (anti-enumeration); public poll fetch MUST NOT leak participant emails.
- All routes sit under the `/api` global prefix — e2e requests must include it.
- Prisma 7 requires the MariaDB driver adapter (`src/prisma/mariadb-adapter.ts`); the e2e test DB must use it, never the dev DB or a bare connection string.

## Acceptance criteria
- [x] `npm test` (unit) and `npm run test:e2e` (e2e) both green against a disposable test schema.
- [x] Validation rejects malformed bodies (whitelist / forbidNonWhitelisted) and unhandled Prisma errors return clean HTTP codes with no internal leak.
- [x] Public submission endpoint is rate-limited; auth endpoints remain throttled.
- [x] Security checklist satisfied: httpOnly + Secure cookies in prod, hashed tokens, anti-enumeration (200 on unknown email), no email leak, credentialed CORS allow-list.
- [x] `docs/DEPLOY.md` documents image build, run order, `prisma migrate deploy`, and required prod env.

## Phases
1. [01-error-handling-and-throttling](01-error-handling-and-throttling.md) — global exception filter + Prisma→HTTP mapping, public-submission throttle, prod cookie/anti-enumeration audit · _solo_ ✓
2. [02-test-suite](02-test-suite.md) — disposable-DB e2e harness + auth & poll-lifecycle happy paths + unit gap-fill (algorithm, auth tokens) · _workflow_ ✓
3. [03-deploy-notes](03-deploy-notes.md) — multi-stage backend Dockerfile + `.dockerignore` + entrypoint + `docs/DEPLOY.md` · _solo_ ✓

## Open questions
- None. (Deploy notes intentionally stay platform-agnostic per PLAN.md "brief deploy notes".)
