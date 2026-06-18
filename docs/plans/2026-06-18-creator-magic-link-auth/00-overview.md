# Creator Magic-Link Auth

**Slug:** `creator-magic-link-auth` (folder: `docs/plans/2026-06-18-creator-magic-link-auth/`)
**Created:** 2026-06-18
**Status:** in-progress

Implements **Phase 2** of [`docs/PLAN.md`](../../PLAN.md). Phases 0 (scaffold/infra) and 1 (schema + Prisma + seed) are done.

## Goal
Passwordless creator sign-in: a creator submits their email, receives an emailed magic link (SHA-256–hashed single-use token), clicks it to exchange the token for a session, and gets a short-lived JWT access cookie + long-lived hashed refresh session — all httpOnly. Includes refresh rotation, logout/revocation, an auth guard, and rate limiting.

## Scope
- `backend/src/mail/` — new global `MailModule`/`MailService` (nodemailer → Mailpit) with `sendMagicLink(email, link)`.
- `backend/src/auth/` — new `AuthModule`: controller, service, DTOs, `JwtAuthGuard`, `@CurrentUser` decorator, throttling.
- `backend/src/main.ts` — register `cookie-parser`.
- `backend/src/app.module.ts` — register `MailModule`, `AuthModule`, and the global `ThrottlerGuard`.

## Out of scope
- Any frontend work (Vue `AuthCallback`, `authStore`, `EmailGate`).
- Schema/migration changes — `User` / `LoginToken` / `AuthSession` already exist (DESIGN §3.4).
- Poll CRUD and all non-auth endpoints (Phase 3+).

## Constraints
- **Prisma 7.8** — runtime client uses the driver adapter already built in `src/prisma/prisma.service.ts`; `import { PrismaClient } from '@prisma/client'`. BigInt ids must be serialized as strings in API responses ([[prisma7-setup]]).
- **Env vars already validated** in `src/config/env.validation.ts` (JWT/cookie/SMTP/throttle/`APP_URL`) — read via `ConfigService`, do not re-add.
- **Deps already installed**: `@nestjs/jwt`, `@nestjs/throttler`, `nodemailer`, `cookie-parser`, `class-validator`/`-transformer`.
- Global prefix is `/api`. Tokens = 32 random bytes (base64url); store only the SHA-256 hex (`CHAR(64)`). `/auth/magic-link` **always** returns 200 (no account enumeration).
- Cookies: httpOnly, `SameSite=Lax`, `Secure` from `COOKIE_SECURE`, domain from `COOKIE_DOMAIN`; access JWT 15m, refresh 30d. Magic link points at `APP_URL/auth/callback?token=<token>`.

## Acceptance criteria
- [ ] Requesting a link emails a magic link to Mailpit; the endpoint always returns 200 and is rate-limited.
- [ ] Clicking through → `POST /auth/verify` consumes the single-use token, creates a session, and sets httpOnly access + refresh cookies.
- [ ] `GET /auth/me` returns the current creator (id as string) with a valid cookie, 401 without.
- [ ] `POST /auth/refresh` rotates the refresh token; `POST /auth/logout` revokes the session and clears cookies (idempotent).
- [ ] Only SHA-256 hex digests are ever stored for login + refresh tokens — raw tokens never hit the DB.
- [ ] `npm run lint` and `npm test -- auth` / `-- mail` pass.

## Phases
1. [01-config-and-mailer](01-config-and-mailer.md) — global nodemailer `MailService.sendMagicLink` → Mailpit; register `cookie-parser` in `main.ts`. · _solo_ ✓
2. [02-magic-link-request](02-magic-link-request.md) — `AuthModule` + `POST /auth/magic-link`: user upsert, hashed single-use token, magic-link email, always-200, throttling. · _solo_ ✓
3. [03-verify-sessions-cookies](03-verify-sessions-cookies.md) — `verify`/`refresh`/`logout`: consume token → hashed-refresh `AuthSession`, httpOnly access + refresh cookies, rotation, revocation. · _solo_ ✓
4. [04-auth-guard-and-me](04-auth-guard-and-me.md) — `JwtAuthGuard` (access-JWT + `token_version` check), `@CurrentUser` decorator, guarded `GET /auth/me`. · _solo_ ✓

## Open questions
- Should `logout` bump `users.token_version` to kill all outstanding access JWTs, or only revoke the one refresh session? (Phase 3 step 9 leaves the global bump optional; Phase 4's guard checks `token_version`, so the mechanism is in place either way.)
