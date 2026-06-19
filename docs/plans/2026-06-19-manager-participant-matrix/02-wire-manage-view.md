# Phase 2: Wire owner-mode ParticipantMatrix into PollManage

**Plan:** [manager-participant-matrix](00-overview.md)
**Depends on:** 01-matrix-owner-mode.md
**Execution:** solo

## Context
The poll creator's manage view (`PollManage.vue`) today shows a condensed per-slot tally via `ResultsTable.vue`. The feature goal is to show the manager a per-participant availability matrix — one row per voter (who voted and what they picked) — by reusing the `ParticipantMatrix` component the public poll already uses. Phase 1 added a backward-compatible **owner mode** to `ParticipantMatrix` (read-only, no editable "You" row). This phase fetches the per-participant rows into the creator-side `pollStore` and mounts the matrix in owner mode, replacing `ResultsTable`.

## Objective
Add a `loadParticipants` action (plus participants state refs) to `pollStore`, fetch it in `PollManage.vue`'s `onMounted` using `currentPoll.publicToken`, and replace `ResultsTable` with an owner-mode `ParticipantMatrix`.

## Files to touch
- `frontend/src/stores/pollStore.ts` — add `participants` / `participantsTotal` / `participantsHasMore` / `participantsState` refs, a `loadParticipants(token, opts?)` action that delegates to `getParticipantResponses` from the public-poll API client, and export them.
- `frontend/src/views/PollManage.vue` — import `ParticipantMatrix`, pull `participants` via `storeToRefs`, call `store.loadParticipants(...)` in the `onMounted` `Promise.all`, and swap `ResultsTable` for owner-mode `ParticipantMatrix`. Remove the `ResultsTable` import + element.
- `frontend/src/stores/__tests__/pollStore.spec.ts` — add a `pollStore.loadParticipants` suite (success + failure).

## Steps
1. **pollStore imports.** In `frontend/src/stores/pollStore.ts`, add `import { getParticipantResponses } from '@/lib/api/public-poll'` (do NOT re-implement the endpoint path — the public-poll client already wraps `GET /api/public/polls/:token/participants-responses`). Add `ParticipantResponsesResult` and `ParticipantRow` to the existing `import type { ... } from '@/lib/api/types'` block. Add `RequestState` to that type import too if it lives in `types.ts` (mirror how `publicPollStore.ts` types `participantsState`); otherwise inline the `'idle' | 'loading' | 'success' | 'error'` union as `publicPollStore` does.

2. **pollStore state refs.** Inside the `usePollStore` setup, alongside the manage-view detail slice (after `results`), declare, mirroring `publicPollStore.ts` lines 44-49:
   - `const participants = ref<ParticipantRow[]>([])`
   - `const participantsTotal = ref(0)`
   - `const participantsHasMore = ref(false)`
   - `const participantsState = ref<RequestState>('idle')`
   Add a one-line doc comment on each in the house style (PRIVACY note on `participants`: rows carry `displayName` only, never email).

3. **pollStore `loadParticipants` action.** Add an action mirroring `publicPollStore.loadParticipants` (the gold standard, lines 117-140) — same signature `async function loadParticipants(token: string, opts?: { limit?: number; offset?: number }): Promise<void>`:
   - set `participantsState.value = 'loading'`
   - `try`: `const res = await getParticipantResponses(token, opts?.limit, opts?.offset)`, then assign `participants.value = res.participants`, `participantsTotal.value = res.total`, `participantsHasMore.value = res.hasMore`, `participantsState.value = 'success'`
   - `catch`: `participants.value = []`, `participantsTotal.value = 0`, `participantsHasMore.value = false`, `participantsState.value = 'error'`
   This is a supplementary load (like `loadResults`), so it does NOT rethrow — the manage page still renders without the matrix. `pollStore` has no `applyError`/`resetError` helper, so do not call them; just track `participantsState` (matrix-failure is non-fatal and surfaced by the empty/error matrix, consistent with how `loadResults` swallows).

4. **pollStore exports.** Add `participants`, `participantsTotal`, `participantsHasMore`, `participantsState`, and `loadParticipants` to the store's returned object (near `results` / `loadResults`).

5. **PollManage imports.** In `frontend/src/views/PollManage.vue`, add `import ParticipantMatrix from '@/components/ParticipantMatrix.vue'` and remove `import ResultsTable from '@/components/ResultsTable.vue'` (line 8).

6. **PollManage storeToRefs.** Add `participants` to the `storeToRefs(store)` destructure at lines 26-27 (e.g. `const { currentPoll, results, participants, detailLoading, detailError, completing, completeError } = storeToRefs(store)`).

7. **PollManage onMounted fetch.** In the `onMounted` `Promise.all` (lines 35-38), add `store.loadParticipants(currentPoll.value.publicToken)` as a third parallel call (same `publicToken` already used by `loadResults`). Keep it inside the `if (currentPoll.value)` guard.

8. **PollManage template swap.** Replace the `<ResultsTable .../>` block (lines 187-193) with an owner-mode `ParticipantMatrix`:
   ```html
   <ParticipantMatrix
     :dates="currentPoll.dates"
     :timezone="currentPoll.timezone"
     :participants="participants"
     :winning-slot-id="results?.best?.slotId ?? null"
     <owner-mode-flag-from-phase-1>
   />
   ```
   Use the exact owner-mode prop name introduced in phase 1 (`01-matrix-owner-mode.md` — e.g. `:owner="true"` / `read-only` / whatever flag it defined). Per phase 1's backward-compatible contract: pass NO `:answers`, NO `:editable`, and NO `@update:answers` listener (owner mode is read-only and renders no "You" row). Confirm the winning-slot-id source: `ParticipantMatrix` expects `winningSlotId: string | null`; derive it from `results.best.slotId` (the same `best` computed already exists at line 56 — prefer `:winning-slot-id="best?.slotId ?? null"`). Leave `AvailabilityGrid` (lines 181-186) unchanged. Keep the matrix gated `v-if="results"` is optional — the matrix can render off `participants` alone, but gate on `currentPoll` (already guaranteed by the outer template). Mirror PublicPoll's wrapper spacing (`<div class="mt-6">`) if the surrounding layout needs it; otherwise place it directly where `ResultsTable` was inside the `lg:col-span-2` column.

9. **pollStore tests.** In `frontend/src/stores/__tests__/pollStore.spec.ts`, the existing harness stubs `@/lib/api/client`'s `get`/`post`. Because `loadParticipants` calls `getParticipantResponses` from `@/lib/api/public-poll`, add a `vi.mock('@/lib/api/public-poll', () => ({ getParticipantResponses: vi.fn() }))` (hoisted, mirroring the `publicPollStore.spec.ts` mock pattern) and import the mocked fn. Add a `describe('pollStore.loadParticipants', ...)` with:
   - **success:** mock `getParticipantResponses` to resolve `{ participants: [{ participantId: 'p1', displayName: 'Ada', answers: [] }], total: 1, hasMore: false }`; call `store.loadParticipants('tok')`; assert `getParticipantResponses` was `toHaveBeenCalledWith('tok', undefined, undefined)`, `store.participants` has the one row, `store.participantsTotal === 1`, `store.participantsHasMore === false`, `store.participantsState === 'success'`.
   - **pagination passthrough:** call `store.loadParticipants('tok', { limit: 50, offset: 100 })`; assert `toHaveBeenCalledWith('tok', 50, 100)`.
   - **failure:** mock reject; assert `store.participants` is `[]`, `participantsTotal === 0`, `participantsHasMore === false`, `participantsState === 'error'`, and that `loadParticipants` does NOT reject (non-fatal — `await expect(store.loadParticipants('tok')).resolves.toBeUndefined()`).

10. **Regression check.** Do not modify `ParticipantMatrix.vue`, `PublicPoll.vue`, `publicPollStore.ts`, or `ResultsTable.vue` in this phase. `ResultsTable.vue` stays on disk (other views/tests may import it) — only its usage in `PollManage.vue` is removed. Re-run the existing `ParticipantMatrix.spec.ts` and `publicPollStore.spec.ts` to confirm the public-poll editable contract (`answers` + `editable` + `@update:answers`) is untouched.

## Verification
- cd frontend && npm run build
- cd frontend && npm run lint
- cd frontend && npx vitest run src/stores/__tests__/pollStore.spec.ts src/components/__tests__/ParticipantMatrix.spec.ts src/stores/__tests__/publicPollStore.spec.ts
- Manual: open `/polls/:id` as the creator on a poll with ≥2 voters — the column that held the condensed tally now shows one matrix row per participant (displayName + per-slot picks), the winning slot column is highlighted, there is NO editable "You" row, and no cells are interactive. AvailabilityGrid still renders above it.

## Acceptance
- [x] `pollStore` exposes `participants`, `participantsTotal`, `participantsHasMore`, `participantsState`, and a `loadParticipants(token, opts?)` action that calls `getParticipantResponses` from `@/lib/api/public-poll`.
- [x] `PollManage.vue` fetches participants in `onMounted` via `currentPoll.publicToken` and renders an owner-mode `ParticipantMatrix` (no `answers`/`editable`/`update:answers`) in place of `ResultsTable`; the `ResultsTable` import is gone.
- [x] `pollStore.spec.ts` covers `loadParticipants` success, pagination passthrough, and non-fatal failure; the public-poll matrix tests still pass.
- [x] `npm run build` and `npm run lint` are clean.
