# Phase 2: Recompute slot_tallies cache inside the submission transaction

**Plan:** [best-slot-computation](00-overview.md)
**Depends on:** 01-results-aggregation-endpoint.md
**Execution:** solo

## Context
Pollendar computes the winning date/slot for a poll — per-slot tallies plus a deterministic best slot, recomputed on every submission, exposed via `GET /api/public/polls/:token/results`. Phase 1 added the live aggregation endpoint and its canonical scoring/tiebreak logic. This phase keeps the persisted `slot_tallies` cache (model `SlotTally`, `@@map slot_tallies`) in sync by recomputing affected slot tallies inside the existing `submitResponses` transaction, so the cached tallies/best stay current after every submit. No DB migration — `SlotTally` already exists in `prisma/schema.prisma`.

## Objective
Recompute and upsert `SlotTally` rows for every slot of the affected poll inside the `submitResponses` `$transaction`, using the same scoring as the Phase 1 live computation.

## Files to touch
- `backend/src/public/public.service.ts` — inside the existing `submitResponses` `$transaction` callback, after `tx.response.createMany(...)`, recompute per-slot tallies for the poll and `tx.slotTally.upsert(...)` each one. Use the `tx` client (not `this.prisma`). Reuse the Phase 1 canonical aggregation SQL.
- `backend/src/public/public.service.spec.ts` — add a unit test asserting the upserts run within the transaction with correct counts/score for the worked example, and that best updates after a subsequent submit.

## Steps
1. In `backend/src/public/public.service.ts`, locate the `submitResponses(token: string, dto: SubmitResponsesDto)` method and its `this.prisma.$transaction(async (tx) => { ... })` block. The block already does `tx.participant.create(...)` then `tx.response.createMany(...)`. The poll id is already in scope from the `findByPublicToken`-style lookup at the top of the method (the `poll.id` used to validate slots).
2. After `tx.response.createMany(...)` and still inside the same `async (tx) => { ... }` callback, run the canonical aggregation against `tx` so it sees the just-inserted rows. Use the SAME query shape as Phase 1 (DESIGN §4), scoped to the poll via `PollSlot` → `PollDate` → `Poll` (`SlotTally` has no FK back to `Poll`). The LEFT JOIN is mandatory so slots with zero responses still appear with all-zero tallies:
   ```ts
   const rows = await tx.$queryRaw<
     {
       id: bigint;
       available_count: bigint | number;
       maybe_count: bigint | number;
       unavailable_count: bigint | number;
       score: bigint | number;
     }[]
   >(Prisma.sql`
     SELECT
       s.id AS id,
       SUM(r.availability = 'available')   AS available_count,
       SUM(r.availability = 'maybe')       AS maybe_count,
       SUM(r.availability = 'unavailable') AS unavailable_count,
       (SUM(r.availability = 'available') * 2 + SUM(r.availability = 'maybe')) AS score
     FROM poll_slots s
     JOIN poll_dates d ON d.id = s.poll_date_id
     LEFT JOIN responses r ON r.poll_slot_id = s.id
     WHERE d.poll_id = ${poll.id}
     GROUP BY s.id
   `);
   ```
   Note: MySQL `SUM(availability = 'available')` returns the count of matching rows; `LEFT JOIN` makes those sums `0` (not NULL) for slots with no responses because the boolean expression evaluates against NULL → coalesce is not needed for the `=` comparison sums, but coerce defensively with `Number(...)` below.
3. Upsert one `SlotTally` per returned row, inside the same `tx`. `pollSlotId` is the `@id`, so `where: { pollSlotId }` is the unique key. Coerce raw SUM results to `Number` (raw aggregates can arrive as `bigint`/`Decimal`/string depending on driver):
   ```ts
   for (const row of rows) {
     const availableCount = Number(row.available_count);
     const maybeCount = Number(row.maybe_count);
     const unavailableCount = Number(row.unavailable_count);
     const score = Number(row.score);
     await tx.slotTally.upsert({
       where: { pollSlotId: row.id },
       update: { availableCount, maybeCount, unavailableCount, score },
       create: {
         pollSlotId: row.id,
         availableCount,
         maybeCount,
         unavailableCount,
         score,
       },
     });
   }
   ```
   `updatedAt` is auto-managed by Prisma, so it stays fresh on every upsert. All upserts share the `submitResponses` transaction, so they commit atomically with the participant + responses.
4. Decision (state explicitly in the method comment): the `GET /api/public/polls/:token/results` endpoint added in Phase 1 stays LIVE — it recomputes from `responses` on read rather than reading `slot_tallies`. The cache written here is an optimization for the creator view (e.g. dashboards / completion flow) and a denormalized source of truth for `best`, NOT the source for the public results endpoint. This avoids stale reads when a submission races in after a prior transaction commits. Keep the cache scoring identical to the live computation so the two never diverge.
5. Do not change the response shape of `submitResponses` (still returns `{ publicToken }`). The tally recompute is a side effect inside the transaction.
6. In `backend/src/public/public.service.spec.ts`, extend the mocked `PrismaService`. The `$transaction` mock follows the existing pattern `jest.fn((cb) => cb(mockTx))` where `mockTx` exposes `participant.create`, `response.createMany`, `$queryRaw`, and `slotTally.upsert` (all `jest.fn()`). Add a test that:
   - Mocks `tx.$queryRaw` to resolve the worked-example rows for slots A, B, C: A=`{ id: 1n, available_count: 3, maybe_count: 0, unavailable_count: 1, score: 6 }`, B=`{ id: 2n, available_count: 2, maybe_count: 2, unavailable_count: 0, score: 6 }`, C=`{ id: 3n, available_count: 2, maybe_count: 1, unavailable_count: 1, score: 5 }`.
   - Calls `submitResponses(token, dto)` and asserts `tx.slotTally.upsert` was called 3 times with the matching `update`/`create` counts and scores (e.g. for A: `availableCount: 3, maybeCount: 0, unavailableCount: 1, score: 6`).
   - Asserts the upserts happened via the `tx` client (i.e. through the `$transaction` callback), not `this.prisma.slotTally.upsert`.
   - Adds a follow-up assertion that a SECOND `submitResponses` call with `$queryRaw` returning a changed best (e.g. B now `available_count: 4, score: 8` overtaking A) results in B's tally being upserted with the new score — demonstrating best updates after a subsequent submit. Best ordering itself (score desc, then available_count desc, then unavailable_count asc, then event_date asc / start_time asc, then slot.id asc) is verified in the Phase 1 results spec; this test only confirms the cache reflects the new winning tally.

## Verification
- npm run lint (in backend/)
- npm test -- public.service (in backend/)
- Manual: submit two responses via `POST /api/public/polls/:token/responses`, then `curl http://localhost:3000/api/public/polls/:token/results` and confirm the live results match what the cache would hold (cache is internal — verify indirectly via a DB peek on `slot_tallies` if desired). `slotId` values are strings on the wire (BigIntSerializerInterceptor).

## Acceptance
- [x] After a successful `submitResponses`, the transaction upserts one `SlotTally` per poll slot (including zero-response slots, via the LEFT JOIN) with counts/score matching the canonical scoring `available*2 + maybe`.
- [x] Unit test asserts the 3 worked-example upserts (A: 3/0/1/6, B: 2/2/0/6, C: 2/1/1/5) occur on the `tx` client, and that a subsequent submit upserts the new winning tally.
- [x] `GET /api/public/polls/:token/results` remains a live computation (cache is not its source); decision documented in a code comment.
