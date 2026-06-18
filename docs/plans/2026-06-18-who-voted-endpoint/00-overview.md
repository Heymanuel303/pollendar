# Who-Voted Endpoint

**Slug:** `who-voted-endpoint` (folder: `docs/plans/2026-06-18-who-voted-endpoint/`)
**Created:** 2026-06-18
**Status:** completed

## Goal
Surface per-participant responses on the public poll surface. Add a new public `GET /api/public/polls/:token/participants-responses` endpoint returning each participant's display name and per-slot answers (never email), plus the frontend client/types/store wiring to consume it. This is the data dependency for the participant matrix (Plan 4 — `participant-matrix`) and is otherwise fully independent.

## Scope
- `backend/src/public`: new `dto/participant-responses.dto.ts`, `PublicService.getParticipantResponses`, controller `@Get('polls/:token/participants-responses')` route + service/controller specs
- `frontend/src/lib/api`: `public-poll.ts` client method, `types.ts` response types
- `frontend/src/stores/publicPollStore.ts`: action + state for participant rows

## Out of scope
- The matrix UI itself (Plan 4 — `participant-matrix`)
- The existing aggregate results endpoint, the `SlotTally` cache, poll create/edit/complete
- Any new authentication or account model

## Constraints
- Capability-URL trust model identical to the existing public routes; unauthenticated
- Returns rows for any valid token regardless of poll status (open OR closed); no submit-gate
- PRIVACY (hard): `select { id, displayName }` only — NEVER `email`; excluded at the Prisma `select` level (email is nullable + unique-per-poll, so mapping it away later is not enough)
- BigInt `participantId`/`slotId` stringified by the global `BigIntSerializerInterceptor` → DTO ids are strings
- Optional `?limit&offset` (default 100, cap ~1000); idempotent read, no state change

## Acceptance criteria
- [x] `GET /api/public/polls/:token/participants-responses` returns `{ participants[], total, hasMore }` with `displayName` + per-slot answers
- [x] No code path can include `email` in the response (verified adversarially)
- [x] Works for open and closed polls with no submit-gate
- [x] Frontend store can load and expose participant rows
- [x] Backend specs + frontend build/lint green

## Phases
1. [01-backend-endpoint](01-backend-endpoint.md) — DTO + service + controller route + specs · _workflow_ ✓
2. [02-frontend-wiring](02-frontend-wiring.md) — client method + types + store action · _solo_ ✓

## Open questions
- Matrix scale: pick the participant-count threshold at which the frontend (Plan 4) switches to pagination/virtualization — the endpoint already supports `limit/offset`.
