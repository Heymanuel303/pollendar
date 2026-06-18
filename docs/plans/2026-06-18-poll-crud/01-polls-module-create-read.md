# Phase 1: PollsModule scaffold — create + read

**Plan:** [poll-crud](00-overview.md)
**Depends on:** none (Phase 2 auth is complete: `JwtAuthGuard`, `@CurrentUser`, `/auth/me` exist)
**Execution:** solo
**Status:** completed

## Context
Pollendar lets authenticated creators build polls: create a poll with nested dates + time slots, list only their own polls, view one, and (later phases) edit/delete while open — each poll exposing an opaque `public_token` for sharing. The Prisma models `Poll`, `PollDate`, `PollSlot` already exist in `backend/prisma/schema.prisma`; Phase 2 already ships cookie-based auth (`JwtAuthGuard` + `@CurrentUser()`). This phase scaffolds the new `PollsModule` and implements the three read/create endpoints, plus a global BigInt→string serialization interceptor so nested poll responses serialize their `BigInt` ids without manual `.toString()` on every field.

## Objective
Deliver `POST /api/polls` (nested dates+slots in one transaction), `GET /api/polls` (own polls only), and `GET /api/polls/:id` (owner view, 404 if not owned), guarded by `JwtAuthGuard` + `@CurrentUser()`, with a global BigInt serialization interceptor and a global `ValidationPipe`.

## Files to touch
- `backend/src/polls/polls.module.ts` — **new**: `PollsModule` declaring `PollsController` + `PollsService` (and the `JwtAuthGuard` providers it needs). Imports nothing extra — `PrismaModule` and `ConfigModule` are `@Global`.
- `backend/src/polls/polls.controller.ts` — **new**: `@Controller('polls')`, all routes `@UseGuards(JwtAuthGuard)`, `@CurrentUser()` for the creator. Endpoints `create`, `list`, `findOne`.
- `backend/src/polls/polls.service.ts` — **new**: `@Injectable()` service with `create`, `findAllForUser`, `findOneForUser`. Injects `PrismaService` and `ConfigService`.
- `backend/src/polls/dto/create-poll.dto.ts` — **new**: `CreatePollDto` + nested `CreatePollDateDto`, `CreatePollSlotDto` (class-validator + `class-transformer` `@Type`).
- `backend/src/polls/public-token.util.ts` — **new**: `generatePublicToken()` (22-char `base64url`) + `buildShareUrl(appUrl, token)`.
- `backend/src/common/bigint-serializer.interceptor.ts` — **new**: global interceptor recursively converting `BigInt` → `string` in every response body.
- `backend/src/main.ts` — **edit**: register the BigInt interceptor (`app.useGlobalInterceptors(...)`) and a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- `backend/src/app.module.ts` — **edit**: add `PollsModule` to `imports`.

## Steps

1. **`public-token.util.ts`** — mirror the `crypto` idiom from `backend/src/auth/auth.service.ts` (which uses `crypto.randomBytes(32).toString('base64url')`). Verified locally: `crypto.randomBytes(16).toString('base64url')` is **exactly 22 chars** (matches `public_token` `@db.Char(22)`).
   ```ts
   import * as crypto from 'crypto';
   /** Opaque, URL-safe sharing token; exactly 22 chars to fit polls.public_token CHAR(22). */
   export function generatePublicToken(): string {
     return crypto.randomBytes(16).toString('base64url'); // 16 bytes → 22 base64url chars
   }
   /** Public sharing URL for a poll, e.g. https://app.example/p/<token>. */
   export function buildShareUrl(appUrl: string, publicToken: string): string {
     return `${appUrl.replace(/\/$/, '')}/p/${publicToken}`;
   }
   ```
   `appUrl` comes from `ConfigService.get<string>('APP_URL')` (validated `@IsNotEmpty` in `backend/src/config/env.validation.ts`).

2. **`dto/create-poll.dto.ts`** — three classes. Use the real Prisma camelCase field names (`title`, `description`, `timezone`, `eventDate`, `sortOrder`, `startTime`, `endTime`, `isAllDay`, `label`). Nested validation needs `@ValidateNested({ each: true })` + `@Type(() => …)` (already used in `env.validation.ts`).
   ```ts
   import { Type } from 'class-transformer';
   import {
     ArrayMinSize, IsArray, IsBoolean, IsISO8601, IsInt, IsNotEmpty,
     IsOptional, IsString, MaxLength, Min, ValidateNested,
   } from 'class-validator';

   /** One time slot on a date. start/end are "HH:mm" or "HH:mm:ss" (Prisma @db.Time). */
   export class CreatePollSlotDto {
     @IsOptional() @IsString() startTime?: string;   // null/absent ⇒ open-ended / all-day
     @IsOptional() @IsString() endTime?: string;
     @IsOptional() @IsBoolean() isAllDay?: boolean;
     @IsOptional() @IsString() @MaxLength(120) label?: string;
     @IsOptional() @IsInt() @Min(0) sortOrder?: number;
   }

   /** One candidate date with at least one slot. */
   export class CreatePollDateDto {
     @IsISO8601() eventDate!: string;                  // "YYYY-MM-DD" (Prisma @db.Date)
     @IsOptional() @IsInt() @Min(0) sortOrder?: number;
     @IsArray() @ArrayMinSize(1)
     @ValidateNested({ each: true }) @Type(() => CreatePollSlotDto)
     slots!: CreatePollSlotDto[];
   }

   /** Create a poll with nested dates + slots in one request. */
   export class CreatePollDto {
     @IsString() @IsNotEmpty() @MaxLength(160) title!: string;
     @IsOptional() @IsString() @MaxLength(1000) description?: string;
     @IsOptional() @IsString() @MaxLength(64) timezone?: string; // defaults to "UTC" in schema
     @IsArray() @ArrayMinSize(1)
     @ValidateNested({ each: true }) @Type(() => CreatePollDateDto)
     dates!: CreatePollDateDto[];
   }
   ```

3. **`polls.service.ts`** — implement three methods. Inject `PrismaService` (`backend/src/prisma/prisma.service.ts`) and `ConfigService`.
   - `async create(userId: bigint, dto: CreatePollDto)`:
     - **Pre-transaction validation** (safer per gotcha: validate before opening the TX so a CHAR(22) collision or a duplicate slot doesn't poison the TX):
       - For each date, dedupe slots in-service on the tuple `(startTime ?? null, endTime ?? null, isAllDay ?? false)` — MySQL treats multiple NULL `end_time`s as distinct, so the DB `@@unique`-style guarantee does **not** cover NULLs (DESIGN §3.4). Throw `ConflictException` ('Duplicate slot on a date') if a date has two identical tuples. Do **not** rely on DB uniqueness for slots.
       - (`dates` non-empty and each date having ≥1 slot is already enforced by `@ArrayMinSize(1)` in the DTO; the service re-checks defensively and throws `BadRequestException` if violated.)
     - Generate `publicToken = generatePublicToken()`.
     - Run a **single** `this.prisma.$transaction(async (tx) => { … })` (callback form, as used in `auth.service.ts`) that does `tx.poll.create({ data: { userId, publicToken, title, description, timezone, dates: { create: [{ eventDate: new Date(d.eventDate), sortOrder, slots: { create: [...] } }] } } })` — nested writes create dates+slots atomically. Convert `eventDate` to `Date` and `startTime`/`endTime` to `Date` (or pass Prisma a `new Date('1970-01-01T'+time+'Z')` for `@db.Time` fields).
     - **Unique-collision handling:** wrap the create in try/catch; on `Prisma.PrismaClientKnownRequestError` with `code === 'P2002'` targeting `public_token`, regenerate the token and retry once (bounded retry, max 3). Import `Prisma` from `@prisma/client`.
     - Return the created poll (id stays `bigint` — the interceptor stringifies it).
   - `async findAllForUser(userId: bigint)`: `this.prisma.poll.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })`. Owner-scoped by `where`.
   - `async findOneForUser(userId: bigint, id: bigint)`: `findFirst({ where: { id, userId }, include: { dates: { orderBy: { sortOrder: 'asc' }, include: { slots: { orderBy: { sortOrder: 'asc' } } } } } })`. **If null ⇒ throw `NotFoundException`** — using `{ id, userId }` in the `where` means a non-owned poll is indistinguishable from a missing one, so we return 404 rather than 403 (do not leak existence). This is the chosen ownership strategy for read; no separate `OwnershipGuard` is needed for these endpoints because the `where userId` scoping enforces it. (A dedicated `polls-ownership.guard.ts` is deferred to the edit/delete phase where the body doesn't carry the scope.)

4. **`polls.controller.ts`** — `@Controller('polls')` (routes resolve under the global `/api` prefix → `/api/polls`). All three handlers `@UseGuards(JwtAuthGuard)` and take `@CurrentUser() user: User` (import `User` type from `@prisma/client`, decorator from `backend/src/auth/current-user.decorator.ts`, guard from `backend/src/auth/jwt-auth.guard.ts`). `user.id` is a `bigint`.
   - `@Post()` `create(@CurrentUser() user, @Body() dto: CreatePollDto)` → `@HttpCode(201)` (default). Return a thin shape `{ id, publicToken, shareUrl, title, status }` where `shareUrl = buildShareUrl(this.config.get('APP_URL'), poll.publicToken)`. The interceptor stringifies `id`, but you may keep the auth-style explicit projection here; with the interceptor in place an explicit `id.toString()` is **optional** (see step 6 trade-off).
   - `@Get()` `list(@CurrentUser() user)` → returns the `findAllForUser` array as-is (interceptor stringifies all `BigInt` ids).
   - `@Get(':id')` `findOne(@CurrentUser() user, @Param('id') id: string)` → parse `BigInt(id)` (wrap in try/catch → `NotFoundException` on bad input), call `findOneForUser`.

5. **`polls.module.ts`** — `@Module({ controllers: [PollsController], providers: [PollsService, JwtAuthGuard, JwtService] })`. `JwtAuthGuard` depends on `JwtService`, `ConfigService`, `PrismaService`; mirror how `AuthModule` (`backend/src/auth/auth.module.ts`) provides `JwtService`/`JwtModule` so the guard resolves. Check `auth.module.ts` for the exact `JwtModule.register`/`JwtService` provider wiring and replicate it (or import `AuthModule` if it `exports` the guard — verify before choosing).

6. **`common/bigint-serializer.interceptor.ts`** — global `NestInterceptor` that maps the response stream and recursively walks the body, replacing every `bigint` with `value.toString()` (handle arrays, plain objects, `Date` left untouched, `null`/primitives passed through). Rationale (DESIGN §3.4): `JSON.stringify(BigInt)` throws, and Prisma emits `BigInt` ids; the existing `auth.controller.ts` works around this by calling `.toString()` per field manually. **Trade-off:** this interceptor makes the manual pattern unnecessary going forward, but we do **not** edit `auth.controller.ts` in this phase (planning-only / out of scope) — the manual `.toString()` there is harmless (string stays a string) and can be simplified in a later cleanup. New polls code relies on the interceptor.
   ```ts
   @Injectable()
   export class BigIntSerializerInterceptor implements NestInterceptor {
     intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
       return next.handle().pipe(map((data) => convert(data)));
     }
   }
   // convert(): if typeof === 'bigint' → String; Array → map(convert);
   // Date/null/primitive → as-is; object → new object with converted values.
   ```

7. **`main.ts`** — after `app.use(cookieParser())`, add:
   - `app.useGlobalInterceptors(new BigIntSerializerInterceptor());`
   - `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));`
   **Findings confirm `main.ts` currently wires NO global `ValidationPipe` and NO interceptor** — both must be added here. `transform: true` is **required** for nested DTO validation (`@Type` instantiates `CreatePollDateDto`/`CreatePollSlotDto`). Note: enabling a global `ValidationPipe` now (rather than deferring to "Phase 8") means existing auth DTOs are also whitelisted — that is safe because auth DTOs already use class-validator decorators and send no extra fields. Import `ValidationPipe` from `@nestjs/common`.

8. **`app.module.ts`** — add `import { PollsModule } from './polls/polls.module';` and append `PollsModule` to the `imports` array (after `AuthModule`).

## Verification
- Lint: `cd backend && npm run lint`
- Build (type-check): `cd backend && npm run build`
- Unit tests (scoped): `cd backend && npx jest polls`
- Full unit suite: `cd backend && npm test`
- Manual (server running via `cd backend && npm run start:dev`, with a valid access cookie from `/api/auth/verify`):
  - Create: `curl -s -X POST http://localhost:3000/api/polls -H 'Content-Type: application/json' --cookie 'pld_at=<accessJwt>' -d '{"title":"Team sync","dates":[{"eventDate":"2026-07-01","slots":[{"startTime":"09:00","endTime":"10:00"}]}]}'` → `201` with `{ "id":"<string>", "publicToken":"<22 chars>", "shareUrl":"…/p/<token>", "title":"Team sync", "status":"open" }`.
  - List: `curl -s http://localhost:3000/api/polls --cookie 'pld_at=<accessJwt>'` → array containing only the caller's polls, `id` as a string.
  - View: `curl -s http://localhost:3000/api/polls/<id> --cookie 'pld_at=<accessJwt>'` → poll with nested `dates[].slots[]`, all ids as strings.
  - Not-owned / missing: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/polls/999999 --cookie 'pld_at=<accessJwt>'` → `404`.
  - Unauthenticated: same `GET` without cookie → `401`.
  - (Cookie name: confirm the access-cookie key from `backend/src/auth/cookie.util.ts` `ACCESS_COOKIE` and use it in `--cookie`.)

## Acceptance
- [x] `backend/src/polls/` contains `polls.module.ts`, `polls.controller.ts`, `polls.service.ts`, `dto/create-poll.dto.ts`, `public-token.util.ts`; `backend/src/common/bigint-serializer.interceptor.ts` exists; `PollsModule` is registered in `app.module.ts`.
- [x] `POST /api/polls` creates poll + dates + slots in a single `prisma.$transaction` and returns `{ id, publicToken, shareUrl, title, status }` with `id` serialized as a string and `publicToken` exactly 22 chars.
- [x] `GET /api/polls` returns only `where userId === currentUser.id`, ordered by `createdAt desc`, all `BigInt` ids serialized as strings.
- [x] `GET /api/polls/:id` returns the owner's poll with nested `dates[].slots[]`; a non-owned or missing id returns `404` (not `403`, no existence leak).
- [x] Duplicate slots `(startTime,endTime,isAllDay)` within one date are rejected in-service (not silently inserted), since MySQL would treat NULL `end_time`s as distinct.
- [x] All three routes return `401` without a valid access cookie (`JwtAuthGuard`).
- [x] Global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform: true })` and `BigIntSerializerInterceptor` are wired in `main.ts`; nested DTOs validate (e.g. empty `dates` or a date with no slots → `400`).
- [x] `polls.service.spec.ts` (and/or `polls.controller.spec.ts`) added mirroring `auth` spec style (mock `PrismaService` via `useValue`), covering: create-with-nested, list-scopes-to-owner, get-not-owned→404, slot-dedupe→409. Suite green via `npx jest polls`.
