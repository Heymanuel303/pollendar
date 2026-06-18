# Phase 3: verify-sessions-cookies

**Plan:** [creator-magic-link-auth](00-overview.md)
**Depends on:** 02-magic-link-request.md
**Execution:** solo

## Context
Pollendar authenticates creators with passwordless emailed magic links. Phase 2 added `POST /auth/magic-link`, which mints a single-use `LoginToken` (SHA-256 hash stored, raw token emailed to `APP_URL/auth/callback?token=<token>`). This phase closes the login loop: the callback page calls back into the API to exchange that raw token for a logged-in session. We issue a short-lived access JWT and a long-lived hashed refresh token, both in httpOnly cookies, and provide rotation + logout. Feature goal recap: passwordless creator auth via magic links with JWT access + hashed refresh sessions in httpOnly cookies.

## Objective
Add `POST /auth/verify`, `POST /auth/refresh`, and `POST /auth/logout` to AuthModule (consuming login tokens, creating/rotating/revoking `AuthSession` rows, setting/clearing httpOnly cookies). `cookie-parser` is already wired into `main.ts` by Phase 1 — this phase only relies on it.

## Files to touch
- `src/main.ts` — confirm `app.use(cookieParser())` is present (added in Phase 1); do **not** re-add it.
- `src/auth/dto/verify.dto.ts` — new `VerifyDto` (`@IsString()` `@IsNotEmpty()` `token`).
- `src/auth/auth.service.ts` — add `verify(token, ctx)`, `refresh(refreshToken, ctx)`, `logout(refreshToken)`; add private helpers `hashToken`, `issueAccessToken`, `createSession`.
- `src/auth/auth.controller.ts` — add `POST verify`, `POST refresh`, `POST logout` handlers that read/set/clear cookies via `@Res({ passthrough: true })` and `@Req()`.
- `src/auth/auth.module.ts` — ensure `JwtModule` is registered async with `JWT_ACCESS_SECRET` + `ACCESS_TOKEN_TTL` (add if Phase 2 did not).
- `src/auth/cookie.util.ts` — new helper exporting `accessCookieOptions(config)`, `refreshCookieOptions(config)`, `clearCookieOptions(config)` (DRY cookie attribute builder).
- `src/auth/auth.service.spec.ts` — extend with verify/refresh/logout unit tests.
- `src/auth/auth.controller.spec.ts` — extend with cookie-setting assertions.

## Steps
1. **`src/main.ts`** — verify `app.use(cookieParser())` is already registered (Phase 1 added it after `setGlobalPrefix('api')`). `req.cookies` must be populated for `refresh`/`logout` to read the refresh cookie. If for any reason it is missing, add it per Phase 1's step; otherwise leave `main.ts` untouched.
2. **`src/auth/cookie.util.ts`** (new) — export a function `baseCookieOptions(config: ConfigService)` returning `{ httpOnly: true, sameSite: 'lax' as const, secure: config.get('COOKIE_SECURE') === true || config.get('COOKIE_SECURE') === 'true', domain: config.get<string>('COOKIE_DOMAIN') || undefined, path: '/' }`. Export `ACCESS_COOKIE = 'accessToken'` and `REFRESH_COOKIE = 'refreshToken'`. Cookie `maxAge` is set per-call by the controller (access 15m, refresh 30d) — derive ms from the TTL strings using the `ms` package if present, else hardcode `15 * 60 * 1000` and `30 * 24 * 60 * 60 * 1000` (check `package.json` for `ms`; the gotchas note TTLs are plain strings like `'15m'`, so do NOT pass them to `maxAge` directly).
3. **`src/auth/dto/verify.dto.ts`** (new) — `export class VerifyDto { @IsString() @IsNotEmpty() token!: string; }` importing from `class-validator`.
4. **`src/auth/auth.service.ts`** — add `private hashToken(raw: string): string { return createHash('sha256').update(raw).digest('hex'); }` (import `createHash` from `node:crypto`).
5. **`auth.service.ts` — `verify(rawToken, ctx: { ip?: string; userAgent?: string })`**:
   - Compute `tokenHash = this.hashToken(rawToken)`.
   - `const loginToken = await this.prisma.loginToken.findUnique({ where: { tokenHash } });`
   - Reject with `UnauthorizedException('Invalid or expired link')` if: not found, `consumedAt !== null`, or `expiresAt < new Date()`.
   - In a single `this.prisma.$transaction([...])`: mark `loginToken.consumedAt = new Date()` (update by `id`), and create the `AuthSession` (see step 6). This prevents the same token creating two sessions.
   - Return `{ user, accessToken, refreshToken }` where the raw refresh token is generated in step 6.
6. **`auth.service.ts` — `private createSession(userId: bigint, ctx)`**: `const rawRefresh = randomBytes(32).toString('base64url');` then `refreshTokenHash = this.hashToken(rawRefresh)`; `expiresAt = new Date(Date.now() + refreshTtlMs())`; `this.prisma.authSession.create({ data: { userId, refreshTokenHash, expiresAt, userAgent: ctx.userAgent?.slice(0, 255) ?? null, ip: ctx.ip ?? null } })`. Return `{ rawRefresh, session }`. (`randomBytes` from `node:crypto`; store ONLY the hex hash into the CHAR(64) column.)
7. **`auth.service.ts` — `private issueAccessToken(user)`**: `return this.jwt.signAsync({ sub: user.id.toString(), email: user.email, tokenVersion: user.tokenVersion }, { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: this.config.getOrThrow('ACCESS_TOKEN_TTL') });` — `sub` is the BigInt id serialized as a string (gotcha: BigInt ids serialize as strings). `tokenVersion` is embedded so logout can invalidate.
8. **`auth.service.ts` — `refresh(rawRefresh, ctx)`**:
   - `refreshTokenHash = this.hashToken(rawRefresh)`; `const session = await this.prisma.authSession.findUnique({ where: { refreshTokenHash }, include: { user: true } });`
   - Reject `UnauthorizedException('Session expired')` if: not found, `revokedAt !== null`, or `expiresAt < new Date()`.
   - Rotate: in a `$transaction`, set the old session `revokedAt = new Date()` and `createSession(session.userId, ctx)` for a fresh refresh token; mint a new access token.
   - Return `{ accessToken, refreshToken: newRawRefresh }`.
9. **`auth.service.ts` — `logout(rawRefresh)`**: if `rawRefresh` present, `await this.prisma.authSession.updateMany({ where: { refreshTokenHash: this.hashToken(rawRefresh), revokedAt: null }, data: { revokedAt: new Date() } });` Optionally increment `user.tokenVersion` for the owning user to invalidate outstanding access JWTs (use `updateMany` keyed via the session's userId; safe no-op if session missing). Always resolve without throwing so logout is idempotent.
10. **`src/auth/auth.controller.ts`** — inject `ConfigService`. Add:
    - `@HttpCode(200) @Post('verify') async verify(@Body() dto: VerifyDto, @Req() req: IncomingMessage & { ip?: string }, @Res({ passthrough: true }) res: Response)` — call `service.verify(dto.token, { ip: req.ip, userAgent: req.headers['user-agent'] })`, then `res.cookie(ACCESS_COOKIE, accessToken, {...access opts, maxAge})` and `res.cookie(REFRESH_COOKIE, refreshToken, {...refresh opts, maxAge})`; respond `{ user: { id: user.id.toString(), email, displayName } }`.
    - `@HttpCode(200) @Post('refresh')` — read `req.cookies?.[REFRESH_COOKIE]`; if missing throw `UnauthorizedException`; call `service.refresh(...)`, re-set both cookies, respond `{ ok: true }`.
    - `@HttpCode(200) @Post('logout')` — read `req.cookies?.[REFRESH_COOKIE]`, call `service.logout(...)`, then `res.clearCookie(ACCESS_COOKIE, clearOpts)` and `res.clearCookie(REFRESH_COOKIE, clearOpts)`, respond `{ ok: true }`. Use Express `Response` type from `express` (already transitively available) or `import type { Response } from 'express';`.
11. **`src/auth/auth.module.ts`** — confirm `JwtModule.registerAsync({ inject: [ConfigService], useFactory: (c) => ({ secret: c.getOrThrow('JWT_ACCESS_SECRET'), signOptions: { expiresIn: c.getOrThrow('ACCESS_TOKEN_TTL') } }) })` is imported and `ConfigService` is available (AppModule's ConfigModule is global). Add only if Phase 2 omitted it.
12. **Throttling** — `POST /auth/verify` and `POST /auth/refresh` are abuse-sensitive. Apply `@Throttle({ default: { ttl: <ms>, limit: <n> } })` if the global ThrottlerGuard from Phase 2 needs a per-route tightening; otherwise rely on the global guard registered in `app.module.ts`. Do not register a second global guard.
13. **Specs** — in `auth.service.spec.ts`, build the module with `Test.createTestingModule({ providers: [AuthService, { provide: PrismaService, useValue: prismaMock }, { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('jwt') } }, { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn().mockReturnValue('15m') } }] })`. Cover: verify rejects consumed/expired/unknown token; verify marks token consumed + creates session + stores only the sha256 hex (assert the value written to `refreshTokenHash` is 64 hex chars and NOT the raw token); refresh rejects revoked/expired and rotates (old revoked, new created); logout revokes matching session and never throws when token absent. In `auth.controller.spec.ts`, mock `AuthService` + `ConfigService`, pass a fake `res` with `cookie`/`clearCookie` jest fns and a `req` with `cookies`/`headers`/`ip`, and assert cookies are set with `httpOnly: true` and cleared on logout.

## Verification
- `cd backend && npm run lint`
- `cd backend && npm run format`
- `cd backend && npm test -- auth`
- Manual end-to-end (requires `docker compose up -d` for MySQL + Mailpit, then `cd backend && npm run start:dev`):
  1. Request a link: `curl -i -X POST http://localhost:3000/api/auth/magic-link -H 'Content-Type: application/json' -d '{"email":"creator@example.com"}'` → `200 { "message": "Check your email" }`.
  2. Open Mailpit UI at `http://localhost:8025`, open the newest message, copy the `token` query param from the `APP_URL/auth/callback?token=...` link.
  3. Verify (capture cookies): `curl -i -c /tmp/pj.cookies -X POST http://localhost:3000/api/auth/verify -H 'Content-Type: application/json' -d '{"token":"<PASTE_TOKEN>"}'` → `200`, response body `{ "user": { "id": "<string>", ... } }`, and two `Set-Cookie` headers `accessToken=...; HttpOnly; SameSite=Lax` and `refreshToken=...; HttpOnly; SameSite=Lax`.
  4. Reusing the same token must fail: rerun step 3 with the same token → `401` (consumed).
  5. Refresh: `curl -i -b /tmp/pj.cookies -c /tmp/pj.cookies -X POST http://localhost:3000/api/auth/refresh` → `200 { "ok": true }` and fresh `Set-Cookie` for both cookies (new refresh value).
  6. Confirm rotation in DB: `docker compose exec mysql mysql -uroot -p<pw> pollendar -e "SELECT id, revoked_at FROM auth_sessions ORDER BY id DESC LIMIT 2;"` → the previous session row has a non-null `revoked_at`.
  7. Logout: `curl -i -b /tmp/pj.cookies -X POST http://localhost:3000/api/auth/logout` → `200 { "ok": true }` with `Set-Cookie` clearing both cookies (`Max-Age=0` / expired date).
  8. Confirm only hashes are stored: `docker compose exec mysql mysql -uroot -p<pw> pollendar -e "SELECT refresh_token_hash FROM auth_sessions LIMIT 1;"` → a 64-char hex string, never a base64url raw token.

## Acceptance
- [x] `req.cookies` is populated (`cookie-parser`, wired in Phase 1) so `refresh`/`logout` can read the refresh cookie.
- [x] `POST /api/auth/verify` consumes a valid login token (sets `consumed_at`), creates one `auth_sessions` row, returns `200` with the user id as a string, and sets httpOnly `accessToken` + `refreshToken` cookies.
- [x] Reusing an already-consumed or expired login token returns `401` and creates no new session.
- [x] `POST /api/auth/refresh` rotates the refresh token (old session `revoked_at` set, new session created), reissues the access cookie, and returns `200`; an invalid/revoked/missing refresh cookie returns `401`.
- [x] `POST /api/auth/logout` revokes the current session, clears both cookies, returns `200`, and is idempotent (no error when the refresh cookie is absent).
- [x] `auth_sessions.refresh_token_hash` and `login_tokens.token_hash` only ever contain 64-char SHA-256 hex digests — raw tokens never hit the database.
- [x] `npm run lint` and `npm test -- auth` pass.
