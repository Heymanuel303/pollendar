# Phase 2: magic-link-request

**Plan:** [creator-magic-link-auth](00-overview.md)
**Depends on:** 01-config-and-mailer.md
**Execution:** solo

## Context
Pollendar uses passwordless creator auth: a creator submits their email and receives a single-use magic link. This phase stands up the `AuthModule` and the first endpoint, `POST /api/auth/magic-link`, which upserts the user, mints a 32-byte token, persists only its SHA-256 hash in `login_tokens`, and emails the link via the `MailService` built in Phase 1. The endpoint always returns `200` (no account enumeration) and is rate-limited per IP/email. Feature goal: passwordless creator authentication via emailed magic links with hashed single-use tokens.

## Objective
Add `AuthModule` exposing `POST /api/auth/magic-link` that validates the email DTO, upserts the user, stores a SHA-256-hashed single-use token with a `MAGIC_LINK_TTL` expiry, emails the `APP_URL/auth/callback?token=<token>` link, always returns 200, and is throttled per request.

## Files to touch
- `src/auth/dto/request-magic-link.dto.ts` — new DTO with `@IsEmail() @IsNotEmpty() email: string`.
- `src/auth/auth.service.ts` — new service: `requestMagicLink(email, requestIp)` — upsert user + create hashed `LoginToken` in a `$transaction`, then send mail; token-gen and hash helpers.
- `src/auth/auth.controller.ts` — new controller `@Controller('auth')`; `POST magic-link` handler with `@HttpCode(200)` and `@Throttle`, reads client IP, returns a fixed `{ ok: true }` body.
- `src/auth/auth.module.ts` — new module importing `MailModule`, providing `AuthService`, declaring `AuthController`, exporting `AuthService`.
- `src/app.module.ts` — register `ThrottlerModule.forRoot` (TTL/limit from env) and import `AuthModule`.
- `src/auth/auth.service.spec.ts` — unit test for `requestMagicLink` (upsert + hashed-token create + mail call, idempotent for existing user).
- `src/auth/auth.controller.spec.ts` — unit test asserting handler always returns 200 / `{ ok: true }` regardless of email.

> Note: `request-magic-link.dto.ts` and the empty `auth.*` / `mail.*` stubs may already exist as scaffolding from Phase 1. Fill stubs in place; do not recreate non-empty files without reading them first.

## Steps
1. **DTO** — In `src/auth/dto/request-magic-link.dto.ts`, define:
   ```ts
   import { IsEmail, IsNotEmpty } from 'class-validator';
   export class RequestMagicLinkDto {
     @IsEmail()
     @IsNotEmpty()
     email!: string;
   }
   ```
2. **Service helpers** — In `src/auth/auth.service.ts`, add private helpers using Node `crypto`:
   - `generateToken(): string` → `crypto.randomBytes(32).toString('base64url')` (43-char plain token).
   - `hashToken(token: string): string` → `crypto.createHash('sha256').update(token).digest('hex')` (64-char hex).
   - `parseTtlToMs(ttl: string): number` → parse strings like `'15m'`/`'30d'`/`'45s'`/`'1h'` (regex `^(\d+)([smhd])$`, multipliers s=1000, m=60000, h=3600000, d=86400000). `ms` is NOT installed.
3. **Service: requestMagicLink** — Add `constructor(private readonly prisma: PrismaService, private readonly mail: MailService, private readonly config: ConfigService)`. Implement `async requestMagicLink(email: string, requestIp: string): Promise<void>`:
   - Generate `plainToken = generateToken()` and `tokenHash = hashToken(plainToken)`.
   - Compute `expiresAt = new Date(Date.now() + parseTtlToMs(this.config.get<string>('MAGIC_LINK_TTL')!))`.
   - In a `this.prisma.$transaction(async (tx) => { ... })`:
     - `const user = await tx.user.upsert({ where: { email }, update: {}, create: { email, displayName: email.split('@')[0] } });`
     - `await tx.loginToken.create({ data: { userId: user.id, tokenHash, expiresAt, requestIp } });`
   - After the transaction commits, build `const link = `${this.config.get<string>('APP_URL')}/auth/callback?token=${plainToken}`;` and `await this.mail.sendMagicLink(email, link);` (use the Phase 1 `MailService` method name; if it differs, mirror its signature).
   - Never throw on "user not found" — `upsert` guarantees a row. Let only infra errors (DB/SMTP) propagate.
4. **Controller** — In `src/auth/auth.controller.ts`:
   ```ts
   @Controller('auth')
   export class AuthController {
     constructor(private readonly authService: AuthService) {}

     @Post('magic-link')
     @HttpCode(200)
     @Throttle({ default: { limit: 5, ttl: 60_000 } })
     async requestMagicLink(@Body() dto: RequestMagicLinkDto, @Req() req: Request) {
       const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
       await this.authService.requestMagicLink(dto.email, ip);
       return { ok: true };
     }
   }
   ```
   Import `Request` from `express`. The `@Throttle` arg shape is the NestJS 11 `@nestjs/throttler` v5 form `{ default: { limit, ttl } }` (ttl in ms). Confirm against the installed `@nestjs/throttler` version; if older, use `@Throttle(limit, ttl)`.
5. **Module** — In `src/auth/auth.module.ts`:
   ```ts
   @Module({
     imports: [MailModule],
     controllers: [AuthController],
     providers: [AuthService],
     exports: [AuthService],
   })
   export class AuthModule {}
   ```
   `PrismaModule` is `@Global`, so `PrismaService` injects without importing it. `ConfigModule` is global too.
6. **app.module.ts wiring** — Add to `imports`:
   - `ThrottlerModule.forRoot([{ ttl: config-driven, limit: config-driven }])` — prefer `forRootAsync` with `useFactory: (config: ConfigService) => [{ ttl: config.get<number>('THROTTLE_TTL') * 1000, limit: config.get<number>('THROTTLE_LIMIT') }], inject: [ConfigService]`. (`THROTTLE_TTL` is seconds; `@nestjs/throttler` wants ms.)
   - `AuthModule` (and `MailModule` if not already imported transitively — it is exported via `AuthModule`, but import explicitly in `app.module.ts` only if other modules need it).
   - Register the throttler globally as an `APP_GUARD` provider: `{ provide: APP_GUARD, useClass: ThrottlerGuard }` so `@Throttle` takes effect.
7. **Unit spec — service** — In `src/auth/auth.service.spec.ts`, build a testing module with mocked `PrismaService` (`$transaction` invokes the callback with a `tx` exposing mocked `user.upsert` + `loginToken.create`), mocked `MailService`, and `ConfigService` returning `MAGIC_LINK_TTL='15m'` and `APP_URL='http://localhost:5173'`. Assert: `user.upsert` called with the email; `loginToken.create` called with a 64-char hex `tokenHash` and a future `expiresAt`; `mail.sendMagicLink` called with a link containing `/auth/callback?token=` and a 43-char token. Add a second case proving idempotency for an existing user (upsert `update: {}`).
8. **Unit spec — controller** — In `src/auth/auth.controller.spec.ts`, mock `AuthService.requestMagicLink`; assert the handler resolves to `{ ok: true }` and returns 200 both when the service resolves and when it would correspond to a non-existent email (service still resolves — no enumeration). Pass a fake `req` with `ip`/`headers`.

## Verification
- Lint: `cd backend && npm run lint`
- Format: `cd backend && npm run format`
- Scoped tests: `cd backend && npm test -- auth`
- Infra + manual flow:
  1. `docker compose up -d` (MySQL :3306, Mailpit SMTP :1025, UI http://localhost:8025).
  2. `cd backend && npm run start:dev` (serves http://localhost:3000/api).
  3. New email (creates user):
     ```bash
     curl -i -X POST http://localhost:3000/api/auth/magic-link \
       -H 'Content-Type: application/json' \
       -d '{"email":"creator@example.com"}'
     ```
     Expect `HTTP/1.1 200` and body `{"ok":true}`.
  4. Same email again — expect another `200`/`{"ok":true}` (idempotent upsert, second `login_tokens` row).
  5. Invalid email — expect `400` (DTO validation):
     ```bash
     curl -i -X POST http://localhost:3000/api/auth/magic-link \
       -H 'Content-Type: application/json' -d '{"email":"not-an-email"}'
     ```
  6. Rate limit — fire the valid request rapidly past `THROTTLE_LIMIT`:
     ```bash
     for i in $(seq 1 8); do curl -s -o /dev/null -w "%{http_code}\n" \
       -X POST http://localhost:3000/api/auth/magic-link \
       -H 'Content-Type: application/json' -d '{"email":"creator@example.com"}'; done
     ```
     Expect trailing requests to return `429`.
  7. Mailpit: open http://localhost:8025 — a message to `creator@example.com` whose body links to `http://<APP_URL>/auth/callback?token=<43-char-token>`.
  8. DB sanity: rows exist in `login_tokens` with a 64-char `token_hash`, a future `expires_at`, null `consumed_at`, and the `request_ip` set; the plain token is NOT stored anywhere.

## Acceptance
- [x] `POST /api/auth/magic-link` returns `200 {"ok":true}` for both new and existing emails (no enumeration).
- [x] Invalid/missing email returns `400` from `RequestMagicLinkDto` validation.
- [x] A `users` row is upserted by email and a `login_tokens` row is created storing only a 64-char SHA-256 hex `token_hash`, with a future `expires_at` and the `request_ip`; the plain token is never persisted.
- [x] Mailpit shows an email containing `APP_URL/auth/callback?token=<43-char base64url token>`.
- [x] Exceeding `THROTTLE_LIMIT` requests within the window yields `429`.
- [x] `npm run lint` and `npm test -- auth` pass; `auth.service.spec.ts` and `auth.controller.spec.ts` cover the upsert+hash+mail path and the always-200 contract.
