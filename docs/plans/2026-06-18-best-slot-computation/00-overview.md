# Best date/slot computation

**Slug:** `best-slot-computation` (folder: `docs/plans/2026-06-18-best-slot-computation/`)
**Created:** 2026-06-18
**Status:** completed

## Goal
Compute the winning date/slot for a poll: per-slot tallies plus a single deterministic best slot, recomputed on every submission and exposed via `GET /api/public/polls/:token/results`. The best is informational — the creator still confirms `finalSlotId` separately (out of scope here).

## Scope
- `backend/src/public` (PublicService, PublicController): new `getResults(token)` + `GET polls/:token/results` handler; new `dto/poll-results.dto.ts`.
- `backend/src/public/public.service.ts`: recompute the `slot_tallies` cache inside the existing `submitResponses` transaction.
- Co-located Jest unit tests (`public.service.spec.ts`) with a mocked `PrismaService`.

## Out of scope
- DB migration — the `SlotTally` model (`@@map slot_tallies`) already exists in `prisma/schema.prisma`.
- Creator-side results/completion flow (`finalSlotId` confirmation, creator `GET /polls/:id` tallies).
- Serving the public results endpoint from the cache — it stays a live computation by design.

## Constraints
- NestJS 11 / Prisma 7 / MySQL 8.4.
- Canonical scoring (DESIGN §4): `score = available*2 + maybe*1`. Deterministic 5-key tie-break: score desc → available_count desc → unavailable_count asc → event_date asc, start_time asc → slot.id asc.
- Aggregation via `$queryRaw` with the DESIGN §4 SQL; **LEFT JOIN** so zero-response slots still appear with all-zero tallies. Coerce raw `SUM(...)` results with `Number(...)`.
- `slotId` values are `bigint` in the service and serialized to strings on the wire by `BigIntSerializerInterceptor`.
- lint = `npm run lint`, test = `npm test -- public.service` (run in `backend/`).

## Acceptance criteria
- [x] `GET /api/public/polls/:token/results` returns `{ best, slots }` with correct per-slot tallies and the deterministic best slot; unknown token → 404.
- [x] Unit test reproduces the worked example (A=3/0/1, B=2/2/0, C=2/1/1): A wins the A/B score-6 tie via available_count, C is third; zero-response slots appear with all-zero tallies.
- [x] `slot_tallies` is recomputed and upserted inside the `submitResponses` transaction so the cache stays current after every submit.

## Phases
1. [01-results-aggregation-endpoint](01-results-aggregation-endpoint.md) — live canonical aggregation + deterministic best slot, `GET /api/public/polls/:token/results`, worked-example unit test · _solo_ ✓
2. [02-slot-tallies-cache](02-slot-tallies-cache.md) — recompute & upsert `SlotTally` inside the submission transaction; results endpoint stays live · _solo_ ✓

## Open questions
- None.
