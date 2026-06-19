# Poll editing (vote-preserving post-creation edits + lifecycle)

**Slug:** `poll-editing` (folder: `docs/plans/2026-06-19-poll-editing/`)
**Created:** 2026-06-19
**Status:** completed

## Goal
Let a poll creator edit a poll after it is live **without destroying participant votes**: add new dates/slots, soft-invalidate (deactivate) existing dates/slots while preserving their historical responses, edit scalar fields (title/description/timezone/closesAt), and run a cancel/reopen lifecycle. Today's `PATCH /api/polls/:id` destructively deletes and recreates all dates/slots (cascading away every vote) and there is no edit UI at all — this plan replaces that with a vote-preserving path and wires it through the frontend.

## The one contract (all phases align on this)
- **Invalidation = a marker, not an endpoint.** Deactivation/reactivation travels as an `invalidatedAt` field on each date/slot row **inside the `PATCH /api/polls/:id` body** (non-null ISO ⇒ invalidate, `null` ⇒ active/reactivate). There are **no** `/invalidate` or `/reactivate` endpoints. Invalidating a date logically invalidates its slots.
- **Vote preservation.** A date/slot with ≥1 response is immutable in place (changing it → 409); to "change" it the creator invalidates it and adds a replacement. Removed rows are soft-invalidated, never deleted. The destructive full-replace survives only as a fast path for polls with zero votes.
- **Lifecycle.** `POST /api/polls/:id/cancel` (open→cancelled) and `POST /api/polls/:id/reopen` (cancelled→open, completed→open clearing `finalSlotId`+`completedAt`). A non-open poll blocks new submissions.
- **Vote visibility.** `GET /api/polls/:id` exposes each slot's response count (`_count.responses`) + `invalidatedAt` so the editor can lock voted slots; the public surface (Phase 3) excludes invalidated rows from the voting view, results/best, and the tally cache, but the participant audit trail (`getParticipantResponses`) still shows historical answers.

## Scope
- **backend/prisma**: new nullable `invalidatedAt` column on `PollDate` + `PollSlot` (additive migration).
- **backend/polls module**: diff-based vote-preserving `update()`, `cancel()`/`reopen()`, enriched `findOneForUser()`, edit DTOs, controller routes, specs.
- **backend/public module**: exclude invalidated rows from the public view/results/tally + gate submissions on open-status, specs.
- **frontend/store + types**: `pollStore` `update`/`remove`/`cancel`/`reopen` actions, `invalidatedAt` + vote-count wire fields, `UpdatePollPayload` input types.
- **frontend/editor**: `/polls/:id/edit` route reusing `PollEditor.vue` in edit mode (lock voted rows, invalidate/reactivate, add new), specs.
- **frontend/manage + participant**: Edit link + Cancel/Reopen/Delete controls + status pills in `PollManage.vue`; cancelled/closed display in `PublicPoll.vue`, specs.

## Out of scope
- Separate per-row invalidate/reactivate REST endpoints (invalidation is a PATCH marker by design).
- Per-row invalidate controls in the manage view (invalidation lives in the editor only).
- Participants editing their own already-submitted votes.
- Notifications/emails on cancel or reopen (no fan-out).
- Bulk operations, undo history, or analytics on edits.

## Constraints
- **Migration is additive/expand-only** — a nullable `invalidated_at` column, no destructive contract phase. Prisma 7 driver-adapter flow (connection string via `prisma.config.ts` from repo-root `.env`; shadow-DB grant per the prisma7-setup memory).
- **An edit must never delete a `Response`** (the load-bearing invariant; adversarially verified in Phase 2). Results stay a live computation; the `slot_tallies` cache excludes invalidated slots.
- Editing is gated to `status === 'open'`; voted rows are immutable in place.
- Tests are co-located with the code they cover (no trailing test phase). Backend: `npm run lint`/`build`/`test`. Frontend: `npm run type-check`/`lint`/`test:unit`/`build`.

## Acceptance criteria
- [x] A creator can add dates/slots, deactivate/reactivate existing ones, and edit scalar fields on a live poll, and **no participant vote is ever destroyed** by an edit.
- [x] Editing a voted slot in place is rejected (409); the creator invalidates + re-adds instead.
- [x] Invalidated dates/slots vanish from the public voting view, results/best, and the tally cache, but their historical responses remain queryable.
- [x] Invalidating the **current best** date/slot recalculates the public best — `GET /results` returns a new `best` (the next-ranked active slot, or `null` if none remain) that excludes it — because best is a live computation, not a cached value. Pinned by an e2e in Phase 3; the contract spans Phase 2 (invalidate) + Phase 3 (`getResults` filter), so both must ship together.
- [x] Submissions to a cancelled/completed poll return 409; to an invalidated slot return 400.
- [x] A creator can cancel an open poll and reopen a cancelled/completed poll (reopen clears the finalized slot); the manage view and participant view reflect all three states.
- [x] `/polls/:id/edit` loads the poll, locks voted rows, allows invalidate/add, and PATCHes via `pollStore.update()`; create mode is unchanged.
- [x] All layer gates green (backend lint/build/test; frontend type-check/lint/test:unit/build).

## Phases
1. [01-schema-soft-invalidation](01-schema-soft-invalidation.md) — add nullable `invalidatedAt` to `PollDate`+`PollSlot` via an additive migration · _solo_ ✓
2. [02-backend-poll-mutation-api](02-backend-poll-mutation-api.md) — vote-preserving diff `update()`, `cancel`/`reopen`, enriched detail read, edit DTOs/routes · _workflow_ ✓
3. [03-backend-public-gating](03-backend-public-gating.md) — exclude invalidated rows from public view/results/tally; gate submission on open-status · _workflow_ ✓
4. [04-frontend-store-and-types](04-frontend-store-and-types.md) — `pollStore` `update`/`remove`/`cancel`/`reopen` + `invalidatedAt`/vote-count types + `UpdatePollPayload` · _solo_ ✓
5. [05-frontend-editor-edit-mode](05-frontend-editor-edit-mode.md) — `/polls/:id/edit` reusing `PollEditor.vue`: load, lock voted rows, invalidate/add, PATCH · _solo_ ✓
6. [06-frontend-lifecycle-controls](06-frontend-lifecycle-controls.md) — manage-view Edit/Cancel/Reopen/Delete + status pills; participant cancelled/closed state · _solo_ ✓

**Execution order:** 1 → (2 ‖ 3 in parallel, both depend only on 1) → 4 (depends on 2's contract; 3 ships the participant behavior) → (5 ‖ 6 in parallel, both depend on 4; 6's Edit link targets 5's route).

## Open questions
- Per-slot vote-count field shape on `GET /api/polls/:id`: `responseCount: number` vs Prisma's passthrough `_count: { responses: number }` — Phase 2 picks; Phase 4/5 must mirror the exact name.
- Reactivating a date that auto-invalidated its slots: Phase 2 reactivates the date and the slots present in the payload — confirm this matches the intended UX (a reactivated date with a still-invalidated slot is possible if the editor leaves that slot's marker set).
