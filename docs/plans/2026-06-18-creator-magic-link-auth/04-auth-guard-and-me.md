# Phase 4: auth-guard-and-me

**Plan:** [creator-magic-link-auth](00-overview.md)
**Depends on:** 03-verify-sessions-cookies.md
**Execution:** solo

## Context
Pollendar gives creators passwordless auth via emailed magic links: a SHA-256 hashed single-use token mints a short-lived access JWT plus a hashed refresh session, both delivered as httpOnly cookies. Phases 1-3 built `src/mail`, the `AuthModule` (controller/service/DTOs), and the `/auth/magic-link`, `/auth/verify`, `/auth/refresh`, `/auth/logout` endpoints that set the `access` and `refresh` cookies. This phase adds the consuming side: a guard that validates the access cookie and exposes the authenticated creator to controllers.

## Objective
Add a `JwtAuthGuard` (validates the access-cookie JWT and the `users.token_version` it was issued against), a `@CurrentUser()` param decorator, and a guarded `GET /api/auth/me` that returns the current creator or 401.

## Files to touch
- `src/auth/jwt-auth.guard.ts` — new `JwtAuthGuard implements CanActivate`: reads the access cookie, `verifyAsync` it, loads the user, checks `tokenVersion`, attaches `req.user`.
- `src/auth/current-user.decorator.ts` — new `@CurrentUser()` param decorator returning `req.user`.
- `src/auth/auth.controller.ts` — add `GET me` handler decorated with `@UseGuards(JwtAuthGuard)` and `@CurrentUser()`, returning a serialized creator DTO (BigInt id → string).
- `src/auth/auth.service.ts` — add a `meFor(userId)` (or reuse an existing user lookup) only if the controller needs it; prefer having the guard attach the full user so the controller just maps it.
- `src/auth/auth.module.ts` — ensure `JwtAuthGuard` is in `providers` (and `exports` if a later module reuses it); `JwtService` already registered via `JwtModule.registerAsync` in phase 1-3.
- `src/auth/jwt-auth.guard.spec.ts` — new unit spec for the guard (valid / missing-cookie / bad-token / stale-tokenVersion cases).
- `src/auth/auth.controller.spec.ts` — extend (or create) with a `GET /auth/me` case.

## Steps
1. Define shared cookie/payload constants. If phase 3 already created a constants source (e.g. `src/auth/auth.constants.ts` exporting `ACCESS_COOKIE_NAME = 'access'`, `REFRESH_COOKIE_NAME = 'refresh'`) and a `JwtAccessPayload` type (`{ sub: string; tokenVersion: number }`), reuse them. Otherwise add them there. Do NOT hardcode different cookie names than phase 3 used when calling `Response.cookie(...)`.
2. Create `src/auth/jwt-auth.guard.ts`:
   - `@Injectable()` class `JwtAuthGuard implements CanActivate`, constructor-injecting `JwtService`, `ConfigService`, and `PrismaService`.
   - `canActivate(ctx: ExecutionContext): Promise<boolean>`:
     - `const req = ctx.switchToHttp().getRequest<Request>();`
     - `const token = req.cookies?.[ACCESS_COOKIE_NAME];` — if falsy, `throw new UnauthorizedException()`.
     - `const payload = await this.jwt.verifyAsync<JwtAccessPayload>(token, { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET') });` wrapped in try/catch — on any verify error `throw new UnauthorizedException()` (do not leak the error).
     - Load the user: `const user = await this.prisma.user.findUnique({ where: { id: BigInt(payload.sub) } });` (payload.sub is a string; convert to BigInt).
     - If `!user` OR `user.tokenVersion !== payload.tokenVersion`, `throw new UnauthorizedException()` (a bumped `token_version` invalidates all outstanding access tokens).
     - Attach: `(req as Request & { user: User }).user = user;` then `return true;`.
   - Import `Request` from `express`, `User` from `@prisma/client`, exceptions/decorators from `@nestjs/common`.
3. Create `src/auth/current-user.decorator.ts`:
   - `export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<Request & { user: User }>().user);`
   - Import `createParamDecorator`, `ExecutionContext` from `@nestjs/common`; `Request` from `express`; `User` from `@prisma/client`.
4. Add a response shape for `/auth/me`. Define a small `MeResponse` (inline type or a `dto/me-response.dto.ts`) `{ id: string; email: string; displayName: string | null }`. Map the Prisma `User` to it, converting `id: user.id.toString()` (BigInt → string per the Prisma 7 / BigInt serialization constraint) and `displayName: user.displayName`.
5. In `src/auth/auth.controller.ts` add the handler:
   - `@UseGuards(JwtAuthGuard)` + `@Get('me')`.
   - Signature: `me(@CurrentUser() user: User): MeResponse { return { id: user.id.toString(), email: user.email, displayName: user.displayName }; }`.
   - Keep the existing class `@Controller('auth')` so the resolved path is `/api/auth/me`.
6. In `src/auth/auth.module.ts`, add `JwtAuthGuard` to `providers`. Add it to `exports` only if a future module (e.g. PollsModule) will reuse it — note in a comment but local-only is fine for this phase. Confirm `PrismaService` is available (it is `@Global`, so no `PrismaModule` re-import needed) and `JwtService` is exported/available from the existing `JwtModule.registerAsync`.
7. Create `src/auth/jwt-auth.guard.spec.ts` (unit, mocked deps):
   - Build the guard with mocked `JwtService` (`verifyAsync` jest.fn), `ConfigService` (`getOrThrow` returns a dummy secret), and `PrismaService` (`{ user: { findUnique: jest.fn() } }`).
   - Helper to fake `ExecutionContext`: `{ switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext` with a mutable `req` carrying `cookies`.
   - Cases: (a) valid token + matching `tokenVersion` → resolves `true` and sets `req.user`; (b) missing cookie → rejects `UnauthorizedException`; (c) `verifyAsync` throws → rejects `UnauthorizedException`; (d) user found but `tokenVersion` mismatch → rejects `UnauthorizedException`; (e) user not found → rejects `UnauthorizedException`.
   - Use `BigInt(1)` for the mocked user `id` and assert the controller-layer mapping converts it via `.toString()` (assert in controller spec).
8. Extend `src/auth/auth.controller.spec.ts` with a `me()` case: pass a mock `User` (id `BigInt(42)`, email, displayName) and assert the returned object equals `{ id: '42', email, displayName }` (string id, no `[object Object]`).
9. Run lint, format, and the scoped test suite; fix any failures.

## Verification
- `cd backend && npm run lint`
- `cd backend && npm run format`
- `cd backend && npm test -- auth` (guard + controller specs green)
- Manual end-to-end (requires `docker compose up -d` for MySQL :3306 + Mailpit, and `cd backend && npm run start:dev`):
  1. Request a link, capturing cookies is not needed yet:
     `curl -i -X POST http://localhost:3000/api/auth/magic-link -H 'Content-Type: application/json' -d '{"email":"creator@example.com"}'` → expect `200 {"ok":true}`.
  2. Open Mailpit UI http://localhost:8025, open the newest mail, copy the token from the `APP_URL/auth/callback?token=<token>` link.
  3. Verify to mint cookies into a jar:
     `curl -i -c /tmp/pj.txt -X POST http://localhost:3000/api/auth/verify -H 'Content-Type: application/json' -d '{"token":"<token>"}'` → expect `200` and `Set-Cookie: access=...; HttpOnly` + `refresh=...; HttpOnly`.
  4. Hit the guarded route with the jar:
     `curl -i -b /tmp/pj.txt http://localhost:3000/api/auth/me` → expect `200` with body `{"id":"<digits>","email":"creator@example.com","displayName":null}` (note `id` is a quoted string).
  5. Without cookies: `curl -i http://localhost:3000/api/auth/me` → expect `401`.
  6. Tamper test: `curl -i -b 'access=not-a-jwt' http://localhost:3000/api/auth/me` → expect `401`.
  7. (Optional, proves tokenVersion check) In a DB shell bump the user: `UPDATE users SET token_version = token_version + 1 WHERE email = 'creator@example.com';` then repeat step 4 → expect `401` (old access cookie now stale).

## Acceptance
- [x] `src/auth/jwt-auth.guard.ts` exports `JwtAuthGuard implements CanActivate` that reads the access cookie, `verifyAsync`s it against `JWT_ACCESS_SECRET`, loads the user, and rejects on missing/invalid token, unknown user, or `tokenVersion` mismatch.
- [x] `src/auth/current-user.decorator.ts` exports `@CurrentUser()` returning the guard-attached `req.user`.
- [x] `GET /api/auth/me` is guarded by `@UseGuards(JwtAuthGuard)` and returns `{ id, email, displayName }` with `id` serialized as a string (BigInt → string).
- [ ] `curl -b <jar> /api/auth/me` returns `200` with the creator; no cookie / bad cookie / stale `token_version` each return `401`.
- [x] `npm run lint` and `npm test -- auth` pass.
