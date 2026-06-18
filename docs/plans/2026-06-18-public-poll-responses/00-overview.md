# Public poll page + response submission

**Slug:** `public-poll-responses` (folder: `docs/plans/2026-06-18-public-poll-responses/`)
**Created:** 2026-06-18
**Status:** completed

## Goal
Anonymous participants can open a poll via its public share link and submit their availability. A new `PublicModule` exposes a sanitized read endpoint and a transactional write endpoint that enforces the existing UNIQUE constraints. This is Phase 4 of [`docs/PLAN.md`](../../PLAN.md); Phase 3 (poll CRUD) is complete.

## Scope
- `backend/src/public/`: new `PublicModule`, `PublicController`, `PublicService`, DTOs, and co-located specs.
- `backend/src/app.module.ts`: register `PublicModule`.
- Reuses the existing Prisma schema (`Participant`, `Response`, `PollSlot`, `PollDate`) — the required `@@unique([pollId, email])` and `@@unique([participantId, pollSlotId])` constraints and `Participant.publicToken` already exist.

## Out of scope
- Best-slot computation / tallies (Phase 5).
- Completion + notification emails (Phase 6).
- Participant edit/re-submission flow (only the participant token is returned for later use).
- No database migration — schema already supports this phase.

## Constraints
- Prisma 7 + `@prisma/adapter-mariadb`, classic `prisma-client-js` generator.
- BigInt ids are stringified globally by `BigIntSerializerInterceptor`; slot ids arrive back as strings.
- Routes carry the global `/api` prefix; public endpoints are anonymous (no guards, no `JwtModule`).
- Responses must never leak participant emails or the owner `userId`.

## Acceptance criteria
- [x] `GET /api/public/polls/:token` returns the sanitized poll (ordered dates → slots) for a valid token, 404 otherwise, with no `userId`/email in the body.
- [x] `POST /api/public/polls/:token/responses` creates a participant + one response per slot in one transaction and returns `{ publicToken }` (201).
- [x] Duplicate email in the same poll → 409; duplicate slot answer → 409; missing email still succeeds; invalid body → 400; unknown token → 404.

## Phases
1. [01-public-poll-fetch](01-public-poll-fetch.md) — `PublicModule` + sanitized `GET /api/public/polls/:token`, 404 on miss · _solo_ ✓
2. [02-response-submission](02-response-submission.md) — transactional `POST .../responses` with P2002→409 mapping, optional email, returns participant token · _solo_ ✓

## Resolved decisions
- Controller base path: **`@Controller('public')`** for the single `PublicController`. Phase 1 adds `@Get('polls/:token')`; Phase 2 adds `@Post('polls/:token/responses')` to that same controller. Routes resolve to `/api/public/polls/:token` and `/api/public/polls/:token/responses`. (Previously an open question — now locked in both phase files.)
