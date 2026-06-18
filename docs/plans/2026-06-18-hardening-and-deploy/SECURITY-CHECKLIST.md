# Security checklist — Phase 1 audit

Audited 2026-06-18 against the live backend code. This records a **verification result**, not new
behavior — every item below was already implemented; Phase 1 only confirms it and adds the
`PrismaExceptionFilter` safety net + the public-submit throttle.

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| 1 | Session cookies are `httpOnly` | ✅ | `baseCookieOptions()` sets `httpOnly: true` — `src/auth/cookie.util.ts:33` |
| 2 | Cookies use `sameSite: 'lax'` | ✅ | `baseCookieOptions()` sets `sameSite: 'lax'` — `cookie.util.ts:34` |
| 3 | Cookies are `Secure` in prod | ✅ | `secure: secure === true \|\| secure === 'true'` from `COOKIE_SECURE` — `cookie.util.ts:35`. **Requires `COOKIE_SECURE=true` in the prod `.env`** (see note). |
| 4 | `COOKIE_DOMAIN` is host-only by default | ✅ | `domain: domain \|\| undefined` — unset `COOKIE_DOMAIN` ⇒ no `Domain` attribute ⇒ host-only cookie — `cookie.util.ts:36` |
| 5 | `clearCookie` matches the set attributes | ✅ | `clearCookieOptions()` returns the bare `baseCookieOptions()` (same domain/path/sameSite/secure) — `cookie.util.ts:58-60` |
| 6 | Anti-enumeration on magic-link | ✅ | `POST /auth/magic-link` is `@HttpCode(200)` and returns `{ ok: true }` unconditionally, regardless of whether the email maps to an account — `src/auth/auth.controller.ts:47-60` |
| 7 | Auth endpoints are throttled | ✅ | `@Throttle` on `magic-link` (5/60s), `verify` (10/60s), `refresh` (10/60s) — `auth.controller.ts:49,68,97` |
| 8 | Public poll view leaks no participant data / owner | ✅ | `PublicService.findByPublicToken` returns only `id/title/description/timezone/status/dates/slots` — no `userId`, no participants, no emails — `src/public/public.service.ts:40-59`; DTO `PublicPoll` deliberately omits owner/participant fields — `src/public/dto/public-poll.dto.ts` |
| 9 | Public results leak no identities | ✅ | `getResults` returns aggregate counts + best slot only (`slotId`, counts, `score`, `date`, `label`) — no participant rows/emails — `public.service.ts:112-130` |
| 10 | Public submit leaks no internal ids | ✅ | `submitResponses` returns only `{ publicToken }` — never the participant `id`, email, or owner data — `public.service.ts:239` |
| 11 | Public write endpoint is rate-limited | ✅ (Phase 1) | `@Throttle({ default: { limit: 10, ttl: 60_000 } })` on `submit`; the two `@Get` routes stay on the global default — `src/public/public.controller.ts` |
| 12 | CORS is an explicit allow-list with credentials | ✅ | `enableCors({ origin: corsOrigins, credentials: true })` where `corsOrigins` is the comma-split `CORS_ORIGINS` (never `*`) — `src/main.ts:36-40` |
| 13 | Unhandled Prisma errors don't leak DB internals | ✅ (Phase 1) | `PrismaExceptionFilter` maps P2002→409 / P2025→404 / P2003→409 / else→500 with a generic body, never echoing `code`/`meta`/`message` — `src/common/prisma-exception.filter.ts`; registered in `main.ts` |

## Production env note

- `COOKIE_SECURE=true` **must** be set in the prod `.env` — otherwise item #3 fails and session
  cookies are sent over plain HTTP. `COOKIE_DOMAIN` should stay unset (or be the exact apex host)
  to keep cookies host-only (item #4).
- `CORS_ORIGINS` must list the exact SPA origin(s); leaving it empty disables cross-origin access,
  and it must never be `*` while `credentials: true` (item #12).
