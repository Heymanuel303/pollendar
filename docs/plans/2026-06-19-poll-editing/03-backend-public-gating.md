# Phase 3: Backend — gate the public read + write paths on soft-invalidation and status

**Plan:** [poll-editing](00-overview.md)
**Depends on:** [01-schema-soft-invalidation.md](01-schema-soft-invalidation.md)
**Execution:** workflow

## Context
The feature lets a poll creator edit a live poll without destroying participant votes: dates/slots are soft-invalidated (a nullable `invalidatedAt` timestamp) rather than deleted, and a poll can be cancelled/reopened. Phase 1 adds the `invalidatedAt` columns to `PollDate` and `PollSlot`; Phase 2 wires the creator-facing mutation path. This phase closes the participant-facing surface so that the things a creator hid (invalidated dates/slots) and the states a creator set (`cancelled`/`completed`) are honored by every public read and the one public write — without ever rewriting history (already-submitted responses to a now-invalidated slot remain queryable through the participant audit trail).

## Objective
Make `PublicService` exclude soft-invalidated dates/slots from the live poll view, the live results/best-slot query, and the in-transaction `slot_tallies` recompute; and make `submitResponses` reject submissions to non-open polls and to invalidated slots — with unit tests covering each gate.

## Files to touch
- `backend/prisma/schema.prisma` — VERIFY ONLY (do not author the migration here). Confirm Phase 1 has added `invalidatedAt DateTime? @map("invalidated_at")` to BOTH `PollDate` (model at lines 107-119) and `PollSlot` (model at lines 121-138). If those fields are absent, STOP — this phase's dependency is unmet; Phase 1 must run first. Do not add the columns yourself.
- `backend/src/public/public.service.ts` — the four gates: (1) `findByPublicToken` include filter, (2) `getResults` raw-query WHERE, (3) `submitResponses` status gate + invalidation-aware `validSlotIds`, (4) `submitResponses` tally-recompute WHERE.
- `backend/src/public/public.service.spec.ts` — add unit tests for every gate (tests live in THIS phase, next to the code).
- `backend/test/polls.e2e-spec.ts` — NEW e2e test pinning the cross-phase contract: after invalidating the *current best* slot via `PATCH /api/polls/:id`, `GET /api/public/polls/:token/results` returns a `best` that EXCLUDES it (the best date recalculates live). Reuses the existing `createPoll` helper (lines 92-121) and `ResultsBody` interface (lines 47-61); see Step 7.
- `backend/src/public/dto/public-poll.dto.ts` — NO field change. The sanitized `PublicPoll*` shapes deliberately omit `invalidatedAt` already; invalidated rows are filtered OUT before mapping, so the wire shape is unchanged. Read it only to confirm no new field leaks in.
- `backend/src/public/public.controller.ts` — NO change (verify): `submit()` (lines 47-50), `getPoll()` (16-19), `getResults()` (22-25) all just delegate. No controller edits.
- `backend/src/public/dto/poll-results.dto.ts`, `dto/submit-responses.dto.ts`, `dto/participant-responses.dto.ts` — NO change (verify). Listed by the explorer for context only; the result/submit shapes are unchanged and `getParticipantResponses` intentionally does NOT filter (see Step 5).

## Steps
1. **Verify the schema prerequisite (read-only).** Open `backend/prisma/schema.prisma` and confirm both `PollDate` (lines 107-119) and `PollSlot` (lines 121-138) carry `invalidatedAt DateTime? @map("invalidated_at")`. The Prisma model field is camelCase `invalidatedAt`; the underlying column is `invalidated_at` (matches the repo's `final_slot_id`/`finalSlotId` mapping convention). The Prisma client filter key is therefore `invalidatedAt`; the raw-SQL column reference is `invalidated_at`. If the fields are missing, do not proceed — the dependency (Phase 1) is unmet.

2. **Gate `findByPublicToken` (`public.service.ts` lines 31-64).** In the `include` block (lines 34-39), add a `where: { invalidatedAt: null }` to BOTH nested levels — the `dates` include AND the `slots` include — because a non-invalidated date can still own an individually invalidated slot, and the date-level filter alone won't hide it. Resulting shape:
   ```ts
   include: {
     dates: {
       where: { invalidatedAt: null },
       orderBy: { sortOrder: 'asc' },
       include: {
         slots: {
           where: { invalidatedAt: null },
           orderBy: { sortOrder: 'asc' },
         },
       },
     },
   },
   ```
   The `.map(...)` projection (lines 50-62) is unchanged — `invalidatedAt` is never read into the DTO, so nothing leaks. Do NOT add a poll-status gate here: the public view must still render for `cancelled`/`completed` polls (the participant UI shows a closed banner; that read is allowed).

3. **Gate `getResults` raw query (`public.service.ts` lines 75-135).** In the `$queryRaw` at lines 94-114, extend the WHERE clause. It currently reads `WHERE d.poll_id = ${poll.id}`. Change it to:
   ```sql
   WHERE d.poll_id = ${poll.id}
     AND d.invalidated_at IS NULL
     AND s.invalidated_at IS NULL
   ```
   `d` aliases `poll_dates`, `s` aliases `poll_slots` (joined at lines 103-104). This drops invalidated slots from BOTH the per-slot tally array and the `rows[0]` best-slot selection. Keep the `${poll.id}` parameterization via `Prisma.sql` exactly as-is — only append the two `AND ... IS NULL` predicates. No status gate here either: results stay readable for closed polls.

4. **Add the status gate + invalidation-aware validity to `submitResponses` (`public.service.ts` lines 236-349).**
   - **4a. Status gate (fail fast).** Immediately after the `if (!poll) { throw new NotFoundException(); }` at lines 244-246 and BEFORE the `validSlotIds` Set is built (line 248), insert:
     ```ts
     if (poll.status !== PollStatus.open) {
       throw new ConflictException('This poll is no longer accepting responses');
     }
     ```
     Import `PollStatus` from `@prisma/client` — the existing import at line 7 is `import { Availability, Prisma } from '@prisma/client';`; widen it to `import { Availability, PollStatus, Prisma } from '@prisma/client';`. `ConflictException` is already imported (line 3). This mirrors `PollsService.update` (polls.service.ts lines 127-129), which throws `ConflictException` when `poll.status !== PollStatus.open`. A `cancelled` poll now blocks submission identically to a `completed` one.
   - **4b. Invalidation-aware `validSlotIds`.** Add `where: { invalidatedAt: null }` to BOTH the `dates` and `slots` includes of the `findUnique` at lines 240-243 (currently `include: { dates: { include: { slots: true } } }`). New shape:
     ```ts
     include: {
       dates: {
         where: { invalidatedAt: null },
         include: { slots: { where: { invalidatedAt: null } } },
       },
     },
     ```
     The `validSlotIds` Set at lines 248-250 is derived from `poll.dates.flatMap((date) => date.slots.map((slot) => slot.id))`, so once the include filters out invalidated rows, a `pollSlotId` pointing at an invalidated slot is no longer in the Set and trips the existing `if (!validSlotIds.has(slotId)) throw new BadRequestException();` at lines 258-260. Do NOT add a separate invalidation check in the answer loop — the include filter is the single source of truth and avoids drift.

5. **Gate the in-transaction tally recompute (`public.service.ts` lines 290-309).** In the `tx.$queryRaw` that recomputes `slot_tallies` (the `SELECT ... FROM poll_slots s JOIN poll_dates d ...`), extend its WHERE the same way as Step 3. It currently reads `WHERE d.poll_id = ${poll.id}`; change to:
   ```sql
   WHERE d.poll_id = ${poll.id}
     AND d.invalidated_at IS NULL
     AND s.invalidated_at IS NULL
   ```
   This is locked-decision Option A (exclude invalidated slots from the recompute) so the `slotTally.upsert` loop (lines 311-327) only writes/refreshes tallies for ACTIVE slots, keeping the cache aligned with `getResults`. Note this does NOT delete the stale `slot_tallies` row for a slot that was active and later invalidated — that historical cache row simply stops being recomputed and is excluded from every live read; deleting it is out of scope (no destructive contract). Leave `getParticipantResponses` (lines 150-221) UNCHANGED: it reads `participants` LEFT JOIN `responses` (no `poll_dates`/`poll_slots` join), and historical responses to a since-invalidated slot are a deliberate audit fact that participants must still see.

6. **Add unit tests to `public.service.spec.ts`.** The existing mock (`pollFindUnique`, `transaction`, `queryRaw`, etc., lines 12-24) drives all assertions; extend its fixtures and add the following specs. Because the service trusts the Prisma `include`/`where` to do the filtering, the strongest unit assertions are on the ARGUMENTS passed to Prisma (the `where: { invalidatedAt: null }` clauses) plus the gate behaviors:
   - **`findByPublicToken` passes the invalidation filter to Prisma.** Update the existing assertion at lines 79-87 (or add a sibling spec) so the expected `findUnique` arg includes `where: { invalidatedAt: null }` at BOTH the `dates` and nested `slots` include levels. This is the canonical proof invalidated rows are excluded at the query layer.
   - **`getResults` raw SQL excludes invalidated dates/slots.** Add a spec that captures the `Prisma.sql` passed to `queryRaw` (use the `capturedSql()` helper pattern at lines 604-608: `(queryRaw.mock.calls[0][0] as Prisma.Sql).strings.join('')`) and asserts the SQL text contains `d.invalidated_at IS NULL` AND `s.invalidated_at IS NULL`. (The mock returns pre-filtered rows, so this string assertion is the meaningful check that the WHERE was added.)
   - **`submitResponses` rejects a non-open poll with 409, before any transaction.** Two specs mirroring the existing 404 spec (lines 232-238): one with `pollFindUnique.mockResolvedValue({ ...pollWithSlots, status: 'cancelled' })` and one with `status: 'completed'`. Each asserts `rejects.toBeInstanceOf(ConflictException)` AND `expect(transaction).not.toHaveBeenCalled()`. Note `pollWithSlots` (lines 137-141) currently has no `status` field — add `status: 'open'` to it so the existing happy-path specs keep passing the new gate, and override per-test for the closed cases.
   - **`submitResponses` rejects a submission to a now-invalidated slot with 400.** Because filtering happens in the `include`, simulate it: `pollFindUnique.mockResolvedValue({ id: 3n, publicToken: 'tok', status: 'open', dates: [{ id: 10n, slots: [{ id: 100n }] }] })` (slot `101n` omitted, as if invalidated), then submit `{ pollSlotId: '101', availability: 'available' }` and assert `rejects.toBeInstanceOf(BadRequestException)` and `expect(transaction).not.toHaveBeenCalled()`. Mirror the existing "slot does not belong to the poll" spec (lines 251-260).
   - **`submitResponses` passes the invalidation filter to the `findUnique` include.** Add a spec (or extend the happy-path spec at lines 182-203) asserting the `pollFindUnique` call arg's include carries `where: { invalidatedAt: null }` at both the `dates` and nested `slots` levels.
   - **tally recompute SQL excludes invalidated slots.** In the happy-path transaction, capture the SQL passed to the tx `$queryRaw` (the `txQueryRaw` spy returned by `mockTransaction`, lines 160-162) and assert its `.strings.join('')` contains `d.invalidated_at IS NULL` AND `s.invalidated_at IS NULL`.
   - **`getParticipantResponses` is NOT filtered (regression guard).** Add/keep a spec asserting the participant-responses SQL (`capturedSql()`) does NOT contain `invalidated_at` — proving the historical audit trail is untouched. The existing "completed/cancelled poll, no status gate" spec (lines 690-706) already guards the status side; this adds the invalidation side.

7. **Add the cross-phase best-recalc e2e regression test (`backend/test/polls.e2e-spec.ts`).** This is the ONE test that proves the load-bearing contract end-to-end: deactivating the current winning slot recalculates the public best date. It needs BOTH Phase 2's PATCH-invalidate AND this phase's `getResults` filter (Step 3), so it lives here — the later, results-owning surface. Mirror the existing best-slot test (lines 194-215):
   - `const poll = await createPoll('Best recalc on invalidate');` — one date, two slots (`slotIds[0]` Morning, `slotIds[1]` Afternoon).
   - Submit one `available` response to `slotIds[0]`, then `GET .../results` and assert `body.best?.slotId === poll.slotIds[0]` (the voted slot is the current winner — same precondition as the existing test).
   - Read the creator detail to get the ids to re-send: `GET /api/polls/${poll.id}` (authed via `session.cookieHeader`, 200) → capture `dates[0].id` and each `dates[0].slots[].id` (Phase 2 enriches this read; ids are stringified BigInts).
   - `PATCH /api/polls/${poll.id}` (authed, expect 200) re-sending the FULL tree: the single date with its `id`, `slots[0]` carrying its `id` + `invalidatedAt: <ISO instant>`, `slots[1]` carrying its `id` and NO marker (stays active). Invalidating a *voted* slot is allowed — the contract only blocks in-place scalar edits of voted slots, not their invalidation.
   - `GET .../results` again and assert BOTH: `body.best?.slotId === poll.slotIds[1]` (best recalculated to the still-active slot) AND `body.slots.every((s) => s.slotId !== poll.slotIds[0])` (the invalidated winner is absent from the tally array). This assertion fails if EITHER Phase 2's invalidate OR this phase's `getResults` WHERE-filter (Step 3) is missing — which is exactly the half-ship it guards against.

8. **Run the verification commands (below) and fix until green.** If `npm run build`/`npm test` fails because Phase 1's `invalidatedAt` columns are not generated into the Prisma client, that confirms the dependency is unmet — re-run Phase 1's migrate+generate, do NOT work around it by editing the schema in this phase.

## Execution strategy
- **Fan-out unit:** ONE implementer agent makes every edit in Steps 2-7 (all land in `public.service.ts`, `public.service.spec.ts`, and `backend/test/polls.e2e-spec.ts`, so they cannot be parallelized without write conflicts). After the implementer lands a green tree, fan out N independent READ-ONLY adversarial verifiers, one per correctness lens below.
- **Shape:** implement -> multi-lens adversarial verify.
- **Isolation:** none. A single implementer edits the shared backend tree sequentially; the verifiers are strictly read-only and never touch the tree.
- **Verify stage:** spawn these adversarial verifiers, each owning one lens and trying to REFUTE that the gate holds:
  - *Vote-preservation / never-deletes-history:* prove no edit deletes a `Response` or a `slot_tallies` row, and that `getParticipantResponses` still returns answers tied to a since-invalidated slot (Step 5 left untouched).
  - *Status-gate + transaction atomicity:* prove the `poll.status !== open` check throws BEFORE `$transaction` runs (fail-fast, no partial participant insert) for BOTH `cancelled` and `completed`, and that `open` still passes.
  - *Filter completeness / no leak:* prove BOTH the date-level AND slot-level `where: { invalidatedAt: null }` exist on `findByPublicToken` and on the `submitResponses` `findUnique`, so a live date owning an invalidated slot still hides that slot; and prove the sanitized DTO never emits `invalidatedAt`.
  - *Results/cache correctness:* prove `getResults` and the tally recompute both carry `d.invalidated_at IS NULL AND s.invalidated_at IS NULL`, so the live best-slot and the `slot_tallies` cache agree and neither counts an invalidated slot. Additionally prove the Step 7 e2e asserts the best slot ACTUALLY CHANGES after invalidating the winner (`best.slotId` flips to the other slot AND the old winner is absent from `slots`) — not merely that the SQL string contains the predicate.
  - Kill/keep rule: a verifier only flags a defect when it can point to the specific missing predicate/clause; if a majority of the spawned skeptics independently refute the same gate, treat it as a real defect and loop the implementer to fix it. A lone skeptic with no concrete missing-line citation is noise — keep the implementation.

## Verification
Run inside `backend/`:
- `npm run lint` — eslint --fix; must be clean.
- `npm run build` — nest build; must compile (this is where a missing `invalidatedAt` on the generated Prisma client surfaces a Phase 1 gap).
- `npm test -- public.service` — the scoped unit suite for this phase; all existing specs plus the new gate specs must pass.
- `npm run test:e2e -- polls.e2e-spec` — runs the cross-phase best-recalc e2e (Step 7). Requires the `pollendar_test` DB + one-time grant (e2e-test-harness memory) AND Phase 2's PATCH-invalidate in the tree; asserts the invalidated winner drops out of both `best` and the `slots` tally array.
- (Optional, if a DB is available) manual smoke: with a poll that has one invalidated slot, `GET /api/public/polls/:token` should omit that slot; `GET /api/public/polls/:token/results` should not list it; `POST /api/public/polls/:token/responses` to that slot id should return 400; the same POST against a `cancelled` poll should return 409.

## Acceptance
- [x] `backend/prisma/schema.prisma` confirmed to carry `invalidatedAt DateTime? @map("invalidated_at")` on both `PollDate` and `PollSlot` (verified, not authored, in this phase).
- [x] `findByPublicToken` and the `submitResponses` `findUnique` both filter `where: { invalidatedAt: null }` at the `dates` AND `slots` include levels; an invalidated slot under a live date is absent from the public view and is rejected (400) on submit.
- [x] `getResults` raw query and the in-transaction `slot_tallies` recompute both carry `AND d.invalidated_at IS NULL AND s.invalidated_at IS NULL`.
- [x] **Best-date recalculation (cross-phase contract, e2e-pinned):** after the *current best* slot is invalidated via `PATCH /api/polls/:id`, `GET /api/public/polls/:token/results` returns a `best` that EXCLUDES it (best recalculates live to the next-ranked active slot, or `null` if none remain) and the invalidated slot is absent from `slots` — covered by the new e2e in `backend/test/polls.e2e-spec.ts`. This pins the Phase 2→Phase 3 dependency so the feature cannot half-ship (Phase 2 invalidate without Phase 3 filter = a still-winning deactivated slot).
- [x] `submitResponses` throws `ConflictException` (409) for `status` of `cancelled` or `completed`, BEFORE opening the transaction; `open` still submits.
- [x] `getParticipantResponses` is unchanged and still returns historical answers for since-invalidated slots (no `invalidated_at` in its SQL).
- [x] No `Response` row or `slot_tallies` row is deleted by any change in this phase; no participant data leaks (no `invalidatedAt`/`userId`/`email` on the wire).
- [x] `npm run lint`, `npm run build`, and `npm test -- public.service` are all green.
