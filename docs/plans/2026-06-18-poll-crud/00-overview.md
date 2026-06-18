# Poll CRUD (dates + slots)

**Slug:** `poll-crud` (folder: `docs/plans/2026-06-18-poll-crud/`)
**Created:** 2026-06-18
**Status:** completed

> Implements **Phase 3** of [`docs/PLAN.md`](../../PLAN.md). Builds on the completed
> Phase 2 (creator magic-link auth: `JwtAuthGuard`, `@CurrentUser()`, session cookies).

## Goal
Authenticated creators build polls: create a poll with nested candidate dates + time
slots, list only their own polls, view one, edit it while `open`, and delete it. Each
poll exposes an opaque 22-char `public_token` for sharing.

## Scope
- `backend/src/polls/` — new `PollsModule`: controller, service, `CreatePollDto`/`UpdatePollDto` (+ nested date/slot DTOs), `public-token.util.ts`, `PollOwnershipGuard`.
- `backend/src/common/bigint-serializer.interceptor.ts` — new global interceptor serializing Prisma `BigInt` ids → strings on the wire (DESIGN §3.4).
- `backend/src/main.ts` — register the BigInt interceptor + a global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`.
- `backend/src/app.module.ts` — register `PollsModule`.

## Out of scope
- Public participant endpoints (`/public/polls/*`) and response submission → Phase 4.
- Best-slot tally computation and `GET /polls/:id` tallies → Phase 5.
- Poll completion (`/complete`), notifications, invite message → Phase 6.
- Frontend views/stores → Phase 7.
- Reworking `auth.controller.ts`'s manual `.toString()` to use the new interceptor (harmless; deferred cleanup).

## Constraints
- NestJS 11 + Prisma 7 (`@prisma/client` ^7.8 with `@prisma/adapter-mariadb`) on MySQL 8.4.
- `BigInt` ids must serialize as strings (raw `JSON.stringify(BigInt)` throws).
- `public_token` is `CHAR(22)`, opaque, `UNIQUE` — generated with Node `crypto` (`randomBytes(16).toString('base64url')` = 22 chars); nanoid is not installed. Handle `P2002` collisions with a bounded retry.
- Per-date slot uniqueness `(startTime, endTime, isAllDay)` enforced in the **service layer** — MySQL treats multiple NULLs as distinct, so a DB unique index can't dedupe all-day/open-ended slots.
- All creator routes guarded by `JwtAuthGuard` + `@CurrentUser()`; ownership failures return `404` (no existence leak), not `403`.
- Routes live under the global `/api` prefix.

## Acceptance criteria
- [x] Authenticated creator `POST /api/polls` creates a poll with multiple dates and slots in one transaction; response carries `id` (string), `publicToken` (22 chars), `shareUrl`, `title`, `status`.
- [x] `GET /api/polls` returns only the caller's own polls; `GET /api/polls/:id` returns the owner's poll with nested `dates[].slots[]`, or `404` if not owned/missing.
- [x] `PATCH /api/polls/:id` edits scalars and replaces nested dates+slots while `open`; returns `409` when `status !== 'open'`.
- [x] `DELETE /api/polls/:id` returns `204` and cascade-removes dates/slots/participants; not-owned → `404`.
- [x] All routes return `401` without a valid access cookie; nested DTO validation rejects empty `dates`/slot-less dates with `400`.
- [x] `npm run lint` and `npm test` (scoped `npx jest polls`) green.

## Phases
1. [01-polls-module-create-read](01-polls-module-create-read.md) — scaffold `PollsModule`, global BigInt interceptor + `ValidationPipe`, and `POST`/`GET`/`GET :id` (create + read, owner-scoped). · _solo_ ✓
2. [02-polls-update-delete](02-polls-update-delete.md) — `PollOwnershipGuard` + `PATCH` (status-gated edit with nested replace, 409 when not open) and `DELETE` (cascade, 204). · _solo_ ✓

## Open questions
- `closesAt` (optional response deadline, in DESIGN's create example) is omitted from Phase-1 `CreatePollDto` but editable via Phase-2 `UpdatePollDto`. If creators should set it at creation time, add it to `CreatePollDto` in Phase 1 — otherwise it's set-on-edit only.
