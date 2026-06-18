# Phase 2: Polls update & delete

**Plan:** [poll-crud](00-overview.md)
**Depends on:** [01-polls-module-create-read.md](01-polls-module-create-read.md)
**Execution:** solo

## Context
Feature goal: authenticated creators build polls — create with nested dates+slots, list only their own, view, edit while open, and delete — exposing an opaque `public_token` for sharing. Phase 1 stood up the `PollsModule` (controller, service, `CreatePollDto` + nested `CreatePollDateDto`/`CreatePollSlotDto` all in `dto/create-poll.dto.ts`, `public_token` util, the global BigInt→string interceptor, and `POST`/`GET` routes — its reads enforce ownership purely via `where: { id, userId }` service-scoping, so **no `PollOwnershipGuard` exists yet**) and wired it into `backend/src/app.module.ts`. This phase adds the two remaining mutating endpoints (`PATCH` and `DELETE`) **and creates the `PollOwnershipGuard`** they need (the request body doesn't carry the owner scope, unlike Phase-1 reads). The Prisma models `Poll`/`PollDate`/`PollSlot` already exist in `backend/prisma/schema.prisma` with cascade deletes on `poll_dates` → `poll_slots`.

## Objective
Add ownership-guarded `PATCH /api/polls/:id` (edit scalar fields plus a full replace of nested dates+slots, allowed only while `status === 'open'`) and `DELETE /api/polls/:id` (cascade-delete the poll), reusing Phase-1 DTO building blocks and conventions.

## Files to touch
- `backend/src/polls/poll-ownership.guard.ts` — **new**: `PollOwnershipGuard` — loads the `:id` poll, 404s if missing or `poll.userId !== currentUser.id`, attaches it to the request for the handler. (Phase 1 deferred this guard; it is built here.)
- `backend/src/polls/dto/update-poll.dto.ts` — **new**: `UpdatePollDto` with optional scalar fields and an optional `dates` array reusing Phase-1 `CreatePollDateDto` (imported from `./create-poll.dto`).
- `backend/src/polls/polls.controller.ts` — **edit**: add `@Patch(':id')` and `@Delete(':id')` handlers, both `@UseGuards(JwtAuthGuard, PollOwnershipGuard)`; the global BigInt→string interceptor from Phase 1 handles id serialization, so return the raw service result (no manual `.toString()`).
- `backend/src/polls/polls.module.ts` — **edit**: register `PollOwnershipGuard` in `providers`.
- `backend/src/polls/polls.service.ts` — **edit**: add `update(pollId, dto)` (status-gated replace inside one `prisma.$transaction`) and `remove(pollId)` (cascade delete).
- `backend/src/polls/polls.service.spec.ts` — **edit**: add unit cases for update-while-open, update-when-completed → 409, delete-not-owned → 404, and nested replace swapping dates/slots.

## Steps
1. **Create `backend/src/polls/dto/update-poll.dto.ts`.** Define `UpdatePollDto` mirroring the class-validator/JSDoc conventions in `backend/src/auth/dto/verify.dto.ts`. All scalar fields are optional (`@IsOptional()`):
   - `title?: string` — `@IsOptional() @IsString() @MaxLength(160)`
   - `description?: string | null` — `@IsOptional() @IsString() @MaxLength(1000)` (allow clearing by sending `null`; accept `@ValidateIf((_, v) => v !== null)` or `@IsOptional()` semantics — clearing maps to `description: null` in the service)
   - `timezone?: string` — `@IsOptional() @IsString() @MaxLength(64)`
   - `closesAt?: string | null` — `@IsOptional() @IsISO8601()` (ISO datetime string; service converts to `Date`; `null` clears it)
   - `dates?: CreatePollDateDto[]` — `@IsOptional() @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => CreatePollDateDto)`, importing `CreatePollDateDto` from `./create-poll.dto` (Phase 1 defines all three create DTOs in that one file) and `Type` from `class-transformer`, `ValidateNested`/`ArrayNotEmpty`/`IsArray`/`IsOptional`/`IsString`/`MaxLength`/`IsISO8601` from `class-validator`. Reuse the nested `CreatePollSlotDto` transitively via `CreatePollDateDto` — do not redefine slot DTOs.
   - Note in a JSDoc comment that `dates` follows a **replace** strategy: when present it fully supersedes the poll's existing dates+slots; when omitted, nested data is left untouched.
2. **Add `update()` to `backend/src/polls/polls.service.ts`.** Signature `async update(pollId: bigint, dto: UpdatePollDto)`. Logic:
   - Load the poll: `const poll = await this.prisma.poll.findUnique({ where: { id: pollId } });` and throw `new NotFoundException('Poll not found')` if null (defensive — `PollOwnershipGuard` already enforces ownership/existence, but the service stays self-contained).
   - **Status gate:** if `poll.status !== PollStatus.open` (`PollStatus` imported from `@prisma/client`), throw `new ConflictException('Poll can only be edited while open')` → HTTP 409.
   - If `dto.dates` is present, run the Phase-1 slot validation/dedupe helper over each date's slots **before** writing: reject empty `dates`/empty per-date `slots` (already covered by `@ArrayNotEmpty`, but re-assert in service) and reject duplicate `(startTime, endTime)` within a date — MySQL treats multiple NULLs as distinct, so this dedupe MUST live in the service (see `backend/prisma/schema.prisma` lines 121-138, no DB unique on slots). Reuse the exact dedupe function authored in Phase 1's `polls.service.ts` rather than re-implementing.
   - Wrap the write in `await this.prisma.$transaction(async (tx) => { ... })` (interactive form, matching `auth.service.ts`):
     - `tx.poll.update({ where: { id: pollId }, data: { ...scalarPatch } })` where `scalarPatch` only includes keys present in the DTO (`title`, `description`, `timezone`, and `closesAt: dto.closesAt == null ? null : new Date(dto.closesAt)`).
     - **Replace nested data** only when `dto.dates` is present: `await tx.pollDate.deleteMany({ where: { pollId } })` (cascade removes child `poll_slots` per `onDelete: Cascade` on `PollSlot.date`), then recreate via the same nested-create shape Phase 1 used: `tx.pollDate.create({ data: { pollId, eventDate: new Date(d.eventDate), sortOrder, slots: { create: [...] } } })` per date (or a `createMany` + nested loop matching Phase 1).
     - **finalSlotId gotcha — state explicitly:** `Poll.finalSlotId` is a circular FK to `PollSlot` (`@relation("FinalSlot")`, `onDelete: SetNull`). A replace that deletes slots could orphan a `finalSlotId`, but editing is gated to `status === 'open'` and `final_slot_id` is only set at completion — so while open it is always `null` and the replace can never orphan it. No extra null-out step is needed; add a code comment saying so.
     - Re-fetch and return the updated poll with `include: { dates: { include: { slots: true }, orderBy: { sortOrder: 'asc' } } }` (mirror Phase 1's read shape) so the controller can serialize it.
3. **Add `remove()` to `backend/src/polls/polls.service.ts`.** Signature `async remove(pollId: bigint): Promise<void>`. Call `await this.prisma.poll.delete({ where: { id: pollId } });` — `onDelete: Cascade` on `PollDate.poll`, `PollSlot.date`, and `Participant.poll` (schema lines 113, 131, 149) removes all children. Catch Prisma's `P2025` (record not found) and rethrow as `new NotFoundException('Poll not found')` for the not-owned/missing case; rely on `PollOwnershipGuard` to convert not-owned into 404 before this runs.
4. **Create `backend/src/polls/poll-ownership.guard.ts`.** A `CanActivate` guard that runs after `JwtAuthGuard` (which attaches `req.user`). Read `req.params.id`, parse `BigInt(id)` (catch → `NotFoundException`), `this.prisma.poll.findUnique({ where: { id } })`; throw `NotFoundException('Poll not found')` if null **or** `poll.userId !== req.user.id` (404 not 403 — no existence leak, matching Phase-1 reads). Optionally attach the loaded poll to `req` for reuse. Inject `PrismaService`. Mirror the structure of `backend/src/auth/jwt-auth.guard.ts`. Register it in `polls.module.ts` `providers`.
5. **Add controller handlers in `backend/src/polls/polls.controller.ts`.** Both guarded by `@UseGuards(JwtAuthGuard, PollOwnershipGuard)` (import `JwtAuthGuard` from `../auth/jwt-auth.guard` and `PollOwnershipGuard` from `./poll-ownership.guard`):
   - `@Patch(':id')` → `update(@Param('id') id: string, @Body() dto: UpdatePollDto)`: call `this.pollsService.update(BigInt(id), dto)` and return the raw service result — Phase 1's global BigInt→string interceptor (`backend/src/common/bigint-serializer.interceptor.ts`, registered in `main.ts`) stringifies all ids, so **no manual `.toString()` mapping is needed**.
   - `@Delete(':id') @HttpCode(204)` → `remove(@Param('id') id: string)`: `await this.pollsService.remove(BigInt(id));` and **return nothing (204 No Content)** — this is the contract for this phase (not `{ ok: true }`). Import `HttpCode` from `@nestjs/common`.
   - The global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` was added to `main.ts` in Phase 1, so `@Body()` DTO validation (including `@Type(() => CreatePollDateDto)` nested transform) already runs — no per-route `@UsePipes` needed.
6. **Extend `backend/src/polls/polls.service.spec.ts`.** Follow the mock pattern in `backend/src/auth/auth.service.spec.ts` (lines 101-108): mock `PrismaService` with method overrides and a `$transaction` mock that, when called with a function, invokes it with a mock `tx`, else `Promise.all()`s the array. Add cases:
   - **edit-while-open succeeds:** `poll.findUnique` returns `{ status: 'open', ... }`; assert `tx.poll.update` called with the scalar patch and the returned object reflects new title.
   - **edit-when-completed → 409:** `poll.findUnique` returns `{ status: 'completed' }`; assert `update()` rejects with `ConflictException`.
   - **nested replace swaps dates/slots:** with `dto.dates` present, assert `tx.pollDate.deleteMany({ where: { pollId } })` is called before `tx.pollDate.create`, and that the dedupe helper rejects a date with duplicate `(startTime, endTime)` slots.
   - **delete-not-owned → 404:** `poll.delete` throws a Prisma `P2025`-shaped error; assert `remove()` rejects with `NotFoundException`. (Ownership 404 itself is covered by `PollOwnershipGuard` tests from Phase 1; this asserts the service's defensive path.)

## Verification
- `npm run lint` (in `backend/`) — ESLint with `--fix`.
- `npm test -- polls.service` (in `backend/`) — runs the scoped `polls.service.spec.ts`; `npm test` for the full unit suite.
- Manual HTTP checks (server via `npm run start:dev`, authenticated cookie from Phase-3 magic-link flow; routes under `/api`):
  - `curl -X PATCH http://localhost:3000/api/polls/<id> -H 'Content-Type: application/json' --cookie '<access cookie>' -d '{"title":"Updated","dates":[{"eventDate":"2026-07-01","sortOrder":0,"slots":[{"isAllDay":true,"sortOrder":0}]}]}'` → 200 with replaced dates/slots; ids serialized as strings.
  - PATCH a poll whose `status` is `completed` → `409 Conflict`.
  - `curl -X DELETE http://localhost:3000/api/polls/<id> --cookie '<access cookie>'` → `204 No Content`; a follow-up `GET /api/polls/<id>` → `404`.
  - `curl -X DELETE` another creator's poll id → `404` (ownership guard).

## Acceptance
- [x] `PATCH /api/polls/:id` edits `title`/`description`/`timezone`/`closesAt` and fully replaces nested dates+slots while `status === 'open'`, returning the updated poll with BigInt ids as strings.
- [x] `PATCH /api/polls/:id` returns `409 Conflict` when the poll's `status !== 'open'`.
- [x] `PATCH` enforces non-empty dates/slots and per-date `(startTime, endTime)` slot dedupe in the service layer.
- [x] `DELETE /api/polls/:id` returns `204 No Content` and cascade-removes the poll's dates, slots, and participants.
- [x] `PATCH`/`DELETE` on a poll the caller does not own return `404` (via `PollOwnershipGuard`).
- [x] `npm run lint` and `npm test -- polls.service` pass.
