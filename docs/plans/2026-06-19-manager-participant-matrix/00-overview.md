# Manager Participant Matrix

**Slug:** `manager-participant-matrix` (folder: `docs/plans/2026-06-19-manager-participant-matrix/`)
**Created:** 2026-06-19
**Status:** completed

## Goal
Show the poll manager (creator) a per-participant availability matrix on `PollManage.vue` — one row per voter (who voted, what they picked) — replacing the condensed per-slot `ResultsTable` tally. Reuses the `ParticipantMatrix` component already built for the public poll, fed by the existing public participants endpoint.

## Scope
- `frontend/src/components/ParticipantMatrix.vue` — add a backward-compatible read-only **owner mode** that omits the editable "You" row (desktop table + mobile card-stack).
- `frontend/src/stores/pollStore.ts` — add a `loadParticipants` action (+ participants state refs) delegating to the public-poll API client's `getParticipantResponses`.
- `frontend/src/views/PollManage.vue` — fetch participants in `onMounted` via `currentPoll.publicToken`; mount the owner-mode matrix in place of `ResultsTable`.

## Out of scope
- The backend participants endpoint (already shipped by the `who-voted-endpoint` plan; reused as-is).
- `PublicPoll.vue` voter behavior — its editable contract must stay unchanged.
- `AvailabilityGrid` (heatmap) — stays on the manage view untouched.
- No new manager-only endpoint; the existing public `participants-responses` route is reused via `currentPoll.publicToken`.

## Constraints
- Frontend-only verification: `cd frontend && npm run build && npm run lint` plus vitest.
- `ParticipantMatrix` is already consumed by `PublicPoll.vue` with an editable "You" row + `answers`/`@update:answers` v-model contract — owner mode MUST be additive and default-off so PublicPoll behaves exactly as today.
- The manager is not a voter: owner mode renders NO "You" row and is fully read-only (no `answers` map, no emit).
- PRIVACY: `ParticipantRow` carries `displayName` only — never `email`.
- `ResultsTable.vue` stays on disk (only its usage in `PollManage.vue` is removed).

## Acceptance criteria
- [x] `ParticipantMatrix` accepts an `owner` flag (default false); when true, no "You" row / "Your vote" toggle renders on either breakpoint, and it mounts with no `answers` and emits nothing.
- [x] All pre-existing `ParticipantMatrix.spec.ts` and `publicPollStore.spec.ts` tests still pass unchanged (PublicPoll contract intact).
- [x] `pollStore` exposes `loadParticipants` (+ state refs) calling `getParticipantResponses`; covered by success / pagination / non-fatal-failure tests.
- [x] `PollManage.vue` fetches participants in `onMounted` and renders the owner-mode matrix replacing `ResultsTable`; `AvailabilityGrid` unchanged.
- [x] build + lint green.

## Phases
1. [01-matrix-owner-mode](01-matrix-owner-mode.md) — backward-compatible read-only owner mode on `ParticipantMatrix` (no "You" row, desktop + mobile) + tests · _solo_ ✓
2. [02-wire-manage-view](02-wire-manage-view.md) — `pollStore.loadParticipants` + mount owner-mode matrix in `PollManage.vue` replacing `ResultsTable` + tests · _solo_ ✓

## Open questions
- None blocking. (Pagination/virtualization for very large voter lists is deferred — the endpoint supports `limit/offset` and the store tracks `participantsHasMore`, but no manager-side pagination UI is in scope here.)
