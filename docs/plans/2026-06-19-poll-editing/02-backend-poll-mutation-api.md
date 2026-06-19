# Phase 2: Backend poll mutation API (vote-preserving edit + lifecycle)

**Plan:** [poll-editing](00-overview.md)
**Depends on:** [01-schema-soft-invalidation.md](01-schema-soft-invalidation.md)
**Execution:** workflow

## Context
The feature lets a poll creator edit a poll after it is live WITHOUT destroying participant votes: add new dates/slots, soft-invalidate (deactivate) existing dates/slots while keeping their historical votes, edit scalar fields, and cancel/reopen the poll. Phase 1 added the nullable `invalidatedAt DateTime?` column to BOTH `PollDate` and `PollSlot` (additive, expand-only). This phase makes the **creator-side** write path honour those guarantees and adds the lifecycle transitions. Today `PollsService.update()` (`backend/src/polls/polls.service.ts` lines 120-168) is destructive: it `deleteMany`s all `poll_dates` and recreates them, which cascade-deletes every `Response` — unacceptable once any vote exists. The participant-facing public read/write gating is **Phase 3**, not this phase.

## The contract this phase establishes (read first — the frontend phases depend on it verbatim)
- **`PATCH /api/polls/:id`** — body `{ title?, description?, timezone?, closesAt?, dates? }`. `dates`, when present, is the **FULL desired tree** of dates→slots. Each date/slot may carry an optional `id` (a stringified BigInt ⇒ an existing row) and an optional `invalidatedAt` (ISO string ⇒ invalidate; `null`/absent ⇒ active). **Invalidation travels as this marker inside the PATCH payload — there are NO separate `/invalidate` or `/reactivate` endpoints.** The editor flips the marker in its form and re-sends the whole tree on Save.
- **`POST /api/polls/:id/cancel`** and **`POST /api/polls/:id/reopen`** — no body. Lifecycle transitions (see Steps C).
- **`DELETE /api/polls/:id`** — unchanged (204, already exists).
- **`GET /api/polls/:id`** — now also returns each slot's `_count.responses` (vote count) and `invalidatedAt`, so the editor can lock voted slots and render invalidated rows.

## Objective
Rewrite `PollsService.update()` to be diff-based and vote-preserving (add new rows; (de)activate existing rows via the explicit `invalidatedAt` marker in the PATCH payload; refuse in-place edits of voted slots — keeping the destructive full-replace ONLY when the poll has zero votes), add `cancel()`/`reopen()` status transitions, and enrich `findOneForUser()` so the creator detail read exposes per-slot vote counts — with all DTO/controller/guard wiring and co-located specs.

## Files to touch
- `backend/src/polls/polls.service.ts` — rewrite `update()` (lines 120-168) into a diff engine; add `cancel()` and `reopen()`; enrich `findOneForUser()` (lines 99-113) with a per-slot response count; add private helpers for diffing dates/slots, counting responses, and matching existing vs incoming.
- `backend/src/polls/dto/update-poll.dto.ts` — add edit-specific nested DTOs (`UpdatePollDateDto`/`UpdatePollSlotDto`) that carry `id?` AND `invalidatedAt?` so the diff can match existing rows and receive the (de)activation marker (do NOT reuse `CreatePollDateDto` verbatim).
- `backend/src/polls/dto/create-poll.dto.ts` — read-only reference; `CreatePollSlotDto`/`CreatePollDateDto` stay the create shape. The new edit DTOs live in `update-poll.dto.ts`.
- `backend/src/polls/polls.controller.ts` — add `POST :id/cancel` and `POST :id/reopen` routes (both `@UseGuards(PollOwnershipGuard)`), mirroring `complete()` at lines 78-82. The `PATCH :id` route signature is unchanged.
- `backend/src/polls/poll-ownership.guard.ts` — read-only reference (already loads `req.poll`); no change.
- `backend/prisma/schema.prisma` — read-only reference (Phase 1 owns the column; this phase assumes `PollDate.invalidatedAt` and `PollSlot.invalidatedAt` exist as `DateTime?` mapped to `invalidated_at`).
- `backend/src/public/*` — **NOT touched in this phase.** The participant-facing public read/write gating (excluding invalidated rows from the voting view + results + tally recompute, and blocking submissions to non-open polls) is owned entirely by **Phase 3** to keep clean module separation. This phase is creator/polls-module only.
- `backend/src/polls/polls.service.spec.ts` — extend `describe('update')`, add `describe('cancel')`/`describe('reopen')`, and a `findOneForUser` count-include assertion; extend the `tx` mock with `response.count`, `pollDate.update`, `pollSlot.update`/`create`, `slotTally.upsert`, `$queryRaw`.
- `backend/src/polls/polls.controller.spec.ts` — add controller tests for `cancel`/`reopen` (parse id + delegate + 404 on non-numeric id), mirroring the `complete` block (lines 136-153).

## Steps

### A. DTO — let the diff identify existing rows + carry the marker (`backend/src/polls/dto/update-poll.dto.ts`)
1. Confirm the current `UpdatePollDto` (lines 21-32) reuses `CreatePollDateDto` for `dates?` — those nested DTOs have NO `id` and NO `invalidatedAt` field, so the service can neither match an existing row nor receive a (de)activation marker. Add an edit-specific nested shape in `update-poll.dto.ts`. **Invalidation is carried as an explicit `invalidatedAt` marker INSIDE this PATCH payload — there are NO separate `/invalidate` or `/reactivate` endpoints:**
   - `UpdatePollSlotDto`: all of `CreatePollSlotDto`'s fields (`startTime?`, `endTime?`, `isAllDay?`, `label?`, `sortOrder?`) PLUS `@IsOptional() @IsNumberString() id?: string;` (BigInt ids arrive as numeric strings — same convention as `CompletePollDto.finalSlotId` and `ResponseAnswerDto.pollSlotId`) PLUS `@IsOptional() @IsISO8601() invalidatedAt?: string | null;` (a non-null ISO instant marks the slot invalidated; `null`/absent means active).
   - `UpdatePollDateDto`: `@IsISO8601() eventDate!: string`, `@IsOptional() @IsInt() @Min(0) sortOrder?`, `@IsOptional() @IsNumberString() id?: string`, `@IsOptional() @IsISO8601() invalidatedAt?: string | null`, and `@ValidateNested({ each: true }) @Type(() => UpdatePollSlotDto) slots!: UpdatePollSlotDto[]` with `@IsArray() @ArrayMinSize(1)`.
   - Change `UpdatePollDto.dates` to `@Type(() => UpdatePollDateDto) dates?: UpdatePollDateDto[]`.
   - Update the class JSDoc: `dates` is a **diff** strategy carrying explicit markers — rows with an `id` match an existing date/slot (a non-null `invalidatedAt` invalidates it, `null` reactivates it); rows without an `id` are new; an existing row absent from the payload is defensively soft-invalidated (never deleted). The editor always re-sends every existing row with its current marker, so the absent-row path is a safety net, not the primary mechanism.
2. Keep `closesAt?: string | null` and the scalar fields exactly as-is (lines 22-25). Do NOT remove the `@IsISO8601()` on `closesAt`.

### B. Service — diff-based, vote-preserving `update()` (`backend/src/polls/polls.service.ts`)
3. Add a private helper `private async countResponsesForPoll(tx, pollId): Promise<number>` (or inline) that returns the total `Response` rows for the poll, e.g. `tx.response.count({ where: { slot: { date: { pollId } } } })`. Use this ONCE at the top of the tx to choose the path. (Add `response: { count: ... }` to the prisma + tx mock in the spec — see Step 14.)
4. Rewrite `update()` (lines 120-168). Keep the defensive load + status gate exactly as now: `findUnique({ where: { id: pollId } })` → 404 if missing; `poll.status !== PollStatus.open` → `ConflictException('Poll can only be edited while open')`. Keep `if (dto.dates !== undefined) this.validateDates(...)` but adapt `validateDates` to accept the new `UpdatePollDateDto[]` (it only reads `slots` + `slotKey`, which read `startTime/endTime/isAllDay` — still present; skip the dedupe/required-slot check for rows carrying a non-null `invalidatedAt`, which are being deactivated). Build the scalar patch identically (lines 134-142).
5. Inside `this.prisma.$transaction(async (tx) => { ... })`:
   - Always apply the scalar patch first: `await tx.poll.update({ where: { id: pollId }, data: scalarPatch })`.
   - When `dto.dates !== undefined`, branch on vote count:
     - **Zero-vote fast path** (`await countResponsesForPoll(tx, pollId) === 0`): keep the existing destructive replace verbatim (delete `poll_dates` → cascade clears slots/responses → recreate via `buildDatesCreate`). This preserves the current behaviour + its `deleteMany`-before-`create` ordering invariant (spec lines 286-300). (New rows carry no `id`; any `invalidatedAt` markers are honoured by simply not creating those rows, or created already-invalidated — simplest: skip rows whose incoming `invalidatedAt` is non-null.)
     - **Has-votes diff path** (count >= 1): NEVER `deleteMany`. Run the diff in Step 6.
6. Diff algorithm (has-votes path). Load existing structure first: `const existingDates = await tx.pollDate.findMany({ where: { pollId }, include: { slots: { include: { _count: { select: { responses: true } } } } } })` (or query response counts per slot separately). Then:
   - **Incoming date with `id`** that matches an existing date:
     - **Date-level marker first:** if the incoming date's `invalidatedAt` is a non-null timestamp, invalidate the date AND every still-active child slot (`tx.pollDate.update({ data: { invalidatedAt } })` + `tx.pollSlot.updateMany({ where: { pollDateId, invalidatedAt: null }, data: { invalidatedAt } })`) and skip per-slot reconciliation for this date (LOCKED decision 1: invalidating a date logically invalidates its slots). If the incoming `invalidatedAt` is `null` and the date is currently invalidated, reactivate the date (`invalidatedAt: null`) before reconciling its slots.
     - For each existing slot of that date, compute `votes = slot._count.responses`.
     - **Incoming slot with `id`** matching an existing slot — honour the explicit marker FIRST, then reconcile scalars:
       - Incoming `invalidatedAt` non-null → invalidate: `tx.pollSlot.update({ where: { id }, data: { invalidatedAt: new Date(incoming.invalidatedAt) } })` (idempotent if already invalidated). Do NOT also attempt scalar edits on a row being invalidated.
       - Incoming `invalidatedAt` null/absent AND the matched slot currently has `invalidatedAt` set → reactivate: `tx.pollSlot.update({ where: { id }, data: { invalidatedAt: null } })` (LOCKED decision 1: reactivation is reversible).
       - For an ACTIVE row (incoming marker null), reconcile scalars:
         - Unchanged (same `startTime/endTime/isAllDay/label/sortOrder` after `timeToDate` normalization): no-op (optionally patch `sortOrder`/`label` only when `votes === 0`).
         - Changed AND `votes >= 1`: throw `ConflictException('A slot with votes cannot be edited in place — invalidate it and add a replacement')` (LOCKED decision 3: voted slots are immutable in place).
         - Changed AND `votes === 0`: `tx.pollSlot.update(...)` the scalar fields freely.
     - **Incoming slot without `id`**: create it — `tx.pollSlot.create({ data: { pollDateId: existingDate.id, ...mapped } })`.
     - **Existing slot absent from the incoming date's slots**: soft-invalidate — `tx.pollSlot.update({ where: { id }, data: { invalidatedAt: new Date() } })`. NEVER delete (its responses are history). Idempotent: skip if already invalidated.
     - Patch the date's own `sortOrder`/`eventDate` only when the date has zero voted slots; if any child slot has votes and the incoming `eventDate` differs, throw the same in-place-edit `ConflictException` (a voted date is immutable in place too — LOCKED decision 3).
   - **Incoming date without `id`**: create the whole date + its slots via the nested-create mapping (reuse `buildDatesCreate` for a single date, or `tx.pollDate.create`).
   - **Existing date absent from the payload**: soft-invalidate the date AND logically invalidate all its still-active slots — set `invalidatedAt = new Date()` on the date and on each active slot (LOCKED decision 1). NEVER delete.
7. Validate every incoming `id` belongs to THIS poll (matched against `existingDates`/their slot ids). An `id` that does not belong → `BadRequestException('date/slot does not belong to this poll')` (matches the public-service slot-ownership 400 pattern at `submitResponses` lines 258-261, and `complete()` lines 203-207). Parse incoming string `id`s to `bigint` defensively (catch → `BadRequestException`), mirroring `parseId`.
8. After mutating, recompute the `SlotTally` cache for every still-active slot of the poll. Reuse the exact recompute SQL from `submitResponses` (`public.service.ts` lines 298-309) but add `AND s.invalidated_at IS NULL AND d.invalidated_at IS NULL` to the `WHERE`, then `tx.slotTally.upsert(...)` per row (same shape as lines 311-327). For slots that just became invalidated, leave their `SlotTally` row in place (it is no longer read because results/best exclude invalidated slots) — do NOT delete it. (This recompute lives in the creator update path; the participant submit-path recompute is Phase 3's to gate.)
9. Return the re-fetched poll with nested dates → slots ordered by `sortOrder` (lines 158-166 shape). Include the `invalidatedAt` field AND each slot's `_count: { select: { responses: true } }` so the creator UI (Phase 5) can render invalidated rows distinctly and lock voted slots; do NOT filter invalidated rows out of the CREATOR response (only the PUBLIC view filters — Phase 3).
10. Enrich `findOneForUser()` (`polls.service.ts` lines 99-113) so the creator detail read (`GET /api/polls/:id`) exposes, per slot, whether it has votes: add `_count: { select: { responses: true } }` to the nested `slots` include (alongside the existing `orderBy: { sortOrder: 'asc' }`). Keep returning invalidated rows here (creator sees history). This `_count.responses` is the canonical vote-presence signal the editor (Phase 5) uses to lock voted slots — do NOT make the editor re-derive it from participant-responses.

### C. Service — lifecycle transitions (`backend/src/polls/polls.service.ts`)
11. Add `async cancel(pollId: bigint)`: in a `$transaction`, load the poll (404 if missing). Allowed source state: `open` → `cancelled` (LOCKED decision 2). If already `cancelled`, idempotent no-op return (mirror `complete()` idempotency at lines 209-211). If `completed`, throw `ConflictException('A completed poll cannot be cancelled; reopen it first')` (only `open->cancelled` is a legal direct edge). Set `status: PollStatus.cancelled`. Do NOT touch `finalSlotId`/`completedAt` (they are already null while open). Return the updated poll. No notification fan-out.
12. Add `async reopen(pollId: bigint)`: in a `$transaction`, load the poll (404 if missing). Allowed source states: `cancelled -> open` and `completed -> open`. Reopening a `completed` poll MUST clear `finalSlotId` and `completedAt` (LOCKED decision 2): `data: { status: PollStatus.open, finalSlotId: null, completedAt: null }`. If already `open`, idempotent no-op. Return the updated poll. No notification fan-out. NOTE the circular FK: `finalSlotId` is `onDelete: SetNull`; nulling it on reopen is the explicit reset and removes orphan-risk during subsequent edits (while open, `finalSlotId` is always null — the diff/replace never has to protect it).

### D. Controller routes (`backend/src/polls/polls.controller.ts`)
13. Add two handlers after `complete()` (lines 78-82), both `@UseGuards(PollOwnershipGuard)` and using `this.parseId(id)`:
   - `@Post(':id/cancel') cancel(@Param('id') id: string) { return this.polls.cancel(this.parseId(id)); }`
   - `@Post(':id/reopen') reopen(@Param('id') id: string) { return this.polls.reopen(this.parseId(id)); }`
   No DTO body is required for either. The `PATCH :id` `update` route (lines 68-72) is unchanged in signature.

### E. Specs (co-located, written in THIS phase)
14. `backend/src/polls/polls.service.spec.ts`: extend the `tx` mock object (lines 31-35) and `prisma` (lines 37-56) with the new tx methods the diff uses: `response: { count }`, `pollDate: { ..., update, findMany }`, `pollSlot: { ..., update, create, updateMany }`, `slotTally: { upsert }`, `$queryRaw`. Reset them in `beforeEach` (lines 92-103). Add tests:
   - Zero-vote update still uses the destructive replace (assert `pollDateDeleteMany` called, `deleteMany` before `create` — preserve the existing invariant test at lines 286-300, gated behind `response.count` resolving 0).
   - Has-votes update NEVER calls `pollDateDeleteMany` (mock `response.count` → 1+) and instead, given an incoming slot carrying `invalidatedAt`, soft-invalidates it (`pollSlot.update` with `invalidatedAt` a `Date`).
   - Editing a VOTED slot in place (changed fields, that slot's `_count.responses >= 1`, incoming marker null) → `ConflictException`, and NO `pollSlot.update` of its scalar fields, NO delete.
   - Editing a ZERO-vote slot in place → `pollSlot.update` of scalars succeeds.
   - Re-activating a previously invalidated slot (`id` present, was `invalidatedAt != null`, incoming marker null) → `pollSlot.update({ data: { invalidatedAt: null } })`.
   - An existing slot omitted from the incoming date soft-invalidates (never deletes); removing a whole date soft-invalidates the date AND its active slots.
   - An `id` not belonging to the poll → `BadRequestException`.
   - Tally recompute upsert runs for active slots after a diff (assert `slotTally.upsert` called).
   - `findOneForUser` passes `_count: { select: { responses: true } }` in the nested `slots` include (assert the `pollFindFirst` call arg shape).
   - `cancel`: open→cancelled sets `status: cancelled`; already-cancelled is idempotent (no second update); completed→cancel throws `ConflictException`; missing poll → 404.
   - `reopen`: cancelled→open sets `status: open`; completed→open ALSO sets `finalSlotId: null` + `completedAt: null` (assert the patch contains both nulls); already-open idempotent; missing → 404.
15. `backend/src/polls/polls.controller.spec.ts`: add `cancel`/`reopen` to the mocked `PollsService` (lines 51-59) and reset list (lines 36-44). Tests mirror the `complete` block (lines 136-153): parse id + delegate (`cancel`/`reopen` called with `3n`), and 404 on a non-numeric id (`parseId` throws synchronously before the service is hit).

## Execution strategy
- **Fan-out unit:** ONE implementer agent makes all the edits across the shared backend files (`polls.service.ts`, `update-poll.dto.ts`, `polls.controller.ts`, and the two spec files) and gets verification green; THEN fan out N independent **read-only adversarial verifiers**. The implementer cannot fan out across these edits because every concern (diff engine, lifecycle, find-enrich) touches the same one-or-two files (`polls.service.ts`) and parallel writers would conflict.
- **Shape:** implement -> multi-lens adversarial verify. Spawn 4 verifiers, each with a distinct correctness lens:
  1. **Vote-preservation / never-deletes-a-voted-slot:** prove no code path with `response.count >= 1` ever calls `pollDate.deleteMany` / `pollSlot.delete`; prove a changed VOTED slot throws `ConflictException` instead of mutating; prove removed/marked rows are soft-invalidated (`invalidatedAt` set), never hard-deleted.
  2. **Marker reconciliation correctness:** prove a non-null incoming `invalidatedAt` invalidates (and a date marker cascades to its active slots), `null` reactivates, and that the marker is honoured BEFORE scalar reconciliation (so a row being invalidated is never also scalar-edited / never trips the voted-immutability 409 spuriously).
  3. **Status-gate + transaction atomicity + finalSlot FK:** prove `update`/`cancel`/`reopen` re-check status inside the tx (TOCTOU-safe like `complete()` lines 191-222); prove `cancel` only accepts `open`, `reopen` accepts `cancelled`+`completed` and nulls `finalSlotId` + `completedAt` on a completed→open; prove all multi-statement mutations stay inside one `$transaction`.
  4. **Creator-response correctness:** prove the creator `update` AND `findOneForUser` responses INCLUDE invalidated rows and each slot's `_count.responses` (creator sees history + can lock voted slots); prove the in-update tally recompute excludes invalidated slots; prove this phase does NOT edit any `public/*` file (that is Phase 3).
- **Isolation:** none. Single implementer edits the shared tree; the 4 verifiers are strictly read-only (no edits, no commits).
- **Verify stage:** each verifier independently re-derives its lens against the diff + the green test run and returns refute/confirm with file:line evidence. Kill/keep rule: a defect is flagged real only when a MAJORITY of the verifiers that examined that code path refute it (a lone skeptic is advisory, not blocking); any confirmed vote-deletion is an automatic blocker regardless of majority (it is the locked-decision invariant).

## Verification
- `cd backend && npm run lint`
- `cd backend && npm run build`
- `cd backend && npm test -- polls.service` (diff + lifecycle + find-enrich unit specs)
- `cd backend && npm test -- polls.controller` (cancel/reopen route specs)
- `cd backend && npm test` (full backend suite green — no regression in create/complete/remove/results; public.service specs are unchanged here and gated in Phase 3)
- Migration: Phase 1 owns the `invalidated_at` column + migration; this phase assumes it is applied. If running locally, apply via the project's Prisma 7 flow from `backend/` — `npx prisma migrate dev` (driver adapter + `prisma.config.ts` supply the connection string from repo-root `.env`; the shadow-DB grant + `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` quirks from the prisma7-setup memory apply only to `migrate reset`, not to a forward `migrate dev`). Do NOT add or re-run a migration in this phase.
- Manual (optional, if a dev DB is up): create a poll, submit one response to slot A, then `PATCH /api/polls/:id` re-sending the tree with slot A carrying `invalidatedAt` and a brand-new slot B (no `id`) — assert `GET /api/polls/:id` still lists A (invalidated, with `_count.responses: 1`) and B (active), and the participant view changes land in Phase 3. Then `POST /api/polls/:id/cancel` then `POST /api/polls/:id/reopen` and assert the status round-trips.

## Acceptance
- [x] An `update()` on a poll with >=1 vote NEVER calls `deleteMany`/`delete` on dates/slots; rows marked with `invalidatedAt` (or omitted) get `invalidatedAt` set and their `Response` rows remain (verified by spec + the vote-preservation verifier).
- [x] A non-null `invalidatedAt` marker in the PATCH payload invalidates a date/slot (date cascades to its active slots); a `null` marker reactivates; markers are honoured before scalar reconciliation.
- [x] Editing a slot that has votes throws `ConflictException`; the same slot with zero votes is editable in place.
- [x] `cancel()` does `open -> cancelled` (idempotent; rejects `completed`); `reopen()` does `cancelled -> open` and `completed -> open` clearing `finalSlotId` + `completedAt`. Routes are `POST /api/polls/:id/cancel` and `POST /api/polls/:id/reopen`.
- [x] `GET /api/polls/:id` returns each slot's response count (`_count.responses`) and `invalidatedAt`, so the editor can lock voted slots and render invalidated rows.
- [x] No `public/*` file is edited in this phase (Phase 3 owns participant gating).
- [ ] **Cross-phase contract (dependency note):** invalidating the *current best* slot here only recalculates the public best date once **Phase 3** ships its `getResults` WHERE-filter — this phase's invalidate is necessary but NOT sufficient. The end-to-end "best recalculates after invalidate" e2e lives in Phase 3 (`backend/test/polls.e2e-spec.ts`); do not consider the best-recalc behavior complete on Phase 2 alone.
- [x] `npm run lint`, `npm run build`, and `npm test` are all green in `backend/`.
