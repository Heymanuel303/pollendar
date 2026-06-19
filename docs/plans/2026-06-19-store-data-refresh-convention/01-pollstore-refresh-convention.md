# Phase 1: pollStore refresh convention

**Plan:** [store-data-refresh-convention](00-overview.md)
**Depends on:** none
**Execution:** solo
**Status:** completed

## Context
The feature standardizes how Pinia stores refresh data after state changes across the Vue frontend: in-place mutations assign the server-returned entity then `await` one derived-slice refresher (no loading flash, no double-fetch); cold loads use one orchestrator that resets+fetches; deletes prune caches; list caches get write-through patches. This phase is the reference implementation: it lands the convention in the creator poll store (`pollStore.ts`) and its manage/editor views, so later phases (publicPollStore, authStore) copy a proven shape. Today the store is inconsistent — `complete`/`update` refresh only `loadResults` (so invite text + participant rows go stale and the dashboard `polls[]` row keeps its old status), while `cancel`/`reopen` call `refreshPoll` as a **floating promise** (the lifecycle button stops spinning before data is fresh) and `refreshPoll` itself routes through `get()` which nulls `currentPoll` and re-fetches the entity the server just returned (a skeleton flash + a wasted round-trip).

## Objective
Add one private derived-slice refresher (`hydrateDerived`) and one public cold-load orchestrator (`loadDetail`) to `pollStore.ts`, route every in-place mutation (`complete`/`update`/`cancel`/`reopen`) through assign-then-`await hydrateDerived`, write-through the `polls[]` row from the returned entity, remove `refreshPoll` from the public surface, point `PollManage.vue` + `PollEditor.vue` `onMounted` at the orchestrator, and update the two specs to match.

## Files to touch
- `frontend/src/stores/pollStore.ts` — add private `hydrateDerived()` + private `patchListRow()`; add public `loadDetail(id)`; rewrite `complete`/`update`/`cancel`/`reopen` to assign-then-`await hydrateDerived` + write-through; delete `refreshPoll`; drop `refreshPoll` from the returned object.
- `frontend/src/views/PollManage.vue` — `onMounted` calls `store.loadDetail(id.value)` (using the existing `id` computed, not `route.params.id as string`).
- `frontend/src/views/PollEditor.vue` — edit-mode `onMounted` calls `pollStore.loadDetail(editId.value!)` instead of `pollStore.get(editId.value!)`.
- `frontend/src/stores/__tests__/pollStore.spec.ts` — replace the per-mutation `loadResults`-only assertions with `hydrateDerived` (results + participants + invite all refetched); add a write-through assertion; add a `loadDetail` describe; assert `refreshPoll` is no longer exposed.
- `frontend/src/views/__tests__/PollManage.spec.ts` — no behavior change needed beyond the existing `mountWithPoll` mock already serving `/polls/42` + `/results` + `participants-responses` + `invite-message`; confirm `loadDetail` drives mount (the four GETs still fire) and lifecycle dialogs still POST.

> README codification of the convention is intentionally **deferred to Phase 3**, which writes the single authoritative `frontend/README.md` section. This phase touches no docs — it only lands the working reference implementation in code + tests.

## Steps
1. **Add the private derived-slice refresher in `pollStore.ts`.** Define, just below `loadInviteMessage` (so all three supplementary loaders are declared above it), a private async fn:
   ```ts
   /**
    * Re-hydrate the supplementary slices hanging off `currentPoll` — live results, participant rows,
    * invite text — in parallel. Each loader swallows its own error (they are supplementary), so this
    * never throws. No-op when `currentPoll` is null. Every in-place mutation (shape A) awaits this; the
    * cold-load orchestrator (shape B) awaits it too. Add a slice once here and every refresh stays correct.
    */
   async function hydrateDerived(): Promise<void> {
     const poll = currentPoll.value
     if (!poll) return
     await Promise.all([
       loadResults(poll.publicToken),
       loadParticipants(poll.publicToken),
       loadInviteMessage(poll.id),
     ])
   }
   ```
   This is the single `hydrateDerived()`-style fn the convention mandates; `loadResults`/`loadParticipants`/`loadInviteMessage` already swallow their own errors (set refs to `null`/`[]`, no throw), so `Promise.all` here will not reject.

2. **Add the private list-cache write-through helper in `pollStore.ts`.** Define a private fn near `hydrateDerived` that patches the matching `polls[]` row from a returned detail entity (shape A, rule 5). `polls[]` holds the thin `Poll` (no nested `dates`), and the returned entity is the full `OwnedPoll`; copy only the fields the dashboard card reads — `status`, `finalSlotId`, `completedAt`, `closesAt`, `title`, `description`, `updatedAt` — so the row reflects the fresh status without a list refetch:
   ```ts
   /** Write-through: patch the matching dashboard `polls[]` row from a mutation's returned detail entity. */
   function patchListRow(poll: OwnedPoll): void {
     const row = polls.value.find((p) => p.id === poll.id)
     if (!row) return
     row.status = poll.status
     row.finalSlotId = poll.finalSlotId
     row.completedAt = poll.completedAt
     row.closesAt = poll.closesAt
     row.title = poll.title
     row.description = poll.description
     row.updatedAt = poll.updatedAt
   }
   ```
   (All listed fields exist on both the store's `Poll` list interface and the wire `OwnedPoll` — verified against `pollStore.ts` `interface Poll` and `@/lib/api/types` `Poll`.)

3. **Add the public cold-load orchestrator `loadDetail` in `pollStore.ts`.** Define it just after `get()` (it composes `get` + `hydrateDerived`). This is shape B — the ONE public orchestrator detail views call in `onMounted`:
   ```ts
   /**
    * Cold-load orchestrator for the manage/edit detail views (component mount / navigation). Resets the
    * detail slice via `get()` (a skeleton is correct here — see `get`), then awaits `hydrateDerived` so
    * results + participants + invite land before the caller proceeds. The ONLY detail-load entry point a
    * view calls in `onMounted`; views never chain the individual loaders themselves.
    */
   async function loadDetail(id: string): Promise<void> {
     await get(id)
     await hydrateDerived()
   }
   ```
   Note `get(id)` already sets `currentPoll.value = null` first (correct skeleton on navigation) and `hydrateDerived` no-ops when the GET 404s and leaves `currentPoll` null.

4. **Rewrite `complete()` to shape A in `pollStore.ts`.** Keep the `completing`/`completeError` lifecycle and the rethrow. Replace the body:
   - `currentPoll.value = await apiPost<OwnedPoll>(\`/polls/${pollId}/complete\`, { finalSlotId })`
   - then `if (currentPoll.value) { patchListRow(currentPoll.value); await hydrateDerived() }`
   - drop the bare `await loadResults(...)` line.
   The `finally { completing.value = false }` stays — it now runs after `hydrateDerived` resolves (rule 4: button stops spinning only when data is fresh). Update the JSDoc to say it refreshes the full derived set + the list row.

5. **Rewrite `update()` to shape A in `pollStore.ts`.** Same transformation as step 4 with `apiPatch<OwnedPoll>(\`/polls/${pollId}\`, payload)`, then `if (currentPoll.value) { patchListRow(currentPoll.value); await hydrateDerived() }`; drop the bare `loadResults`. Keep `updating`/`updateError`/rethrow. Update JSDoc.

6. **Rewrite `cancel()` to shape A in `pollStore.ts`, fixing the floating promise.** Replace `currentPoll.value = await apiPost<OwnedPoll>(\`/polls/${pollId}/cancel\`)` then the **un-awaited** `refreshPoll(pollId)` with: assign the returned poll, then `if (currentPoll.value) { patchListRow(currentPoll.value); await hydrateDerived() }`. Keep `lifecycleTransitioning`/`lifecycleError`/rethrow. The `finally` now clears `lifecycleTransitioning` only after the derived refresh resolves. Update JSDoc (remove the "load them in parallel" inline comment referencing `refreshPoll`).

7. **Rewrite `reopen()` to shape A in `pollStore.ts`.** Same as step 6 with `\`/polls/${pollId}/reopen\``: assign returned poll, `if (currentPoll.value) { patchListRow(currentPoll.value); await hydrateDerived() }`, remove the floating `refreshPoll(pollId)`. Keep lifecycle refs/rethrow + JSDoc update.

8. **Delete `refreshPoll` from `pollStore.ts`.** Remove the whole `async function refreshPoll(id: string)` definition (lines ~136-146) and remove `refreshPoll` from the returned object literal (last key before the closing `}`). `hydrateDerived` + `patchListRow` are private (NOT added to the return) per the convention (views never call the derived refresher directly). Keep `get`, `loadResults`, `loadParticipants`, `loadInviteMessage` exposed (other specs/views still reference them), and add `loadDetail` to the returned object.

9. **Point `PollManage.vue` `onMounted` at the orchestrator.** Change the `onMounted` body from `store.refreshPoll(route.params.id as string)` to `await store.loadDetail(id.value)`, using the existing `const id = computed<string>(() => String(route.params.id ?? ''))`. Make the arrow `async` (it already is) and `await` the call so there is no floating promise in the view either. No other view change — `currentPoll`/`results`/`participants` are already `storeToRefs`-destructured and the lifecycle confirm handlers (`confirmCancel`/`confirmReopen`) already `await store.cancel/reopen`, which now resolve only when data is fresh.

10. **Point `PollEditor.vue` edit-mode `onMounted` at the orchestrator.** In the `onMounted` edit branch change `await pollStore.get(editId.value!)` to `await pollStore.loadDetail(editId.value!)`, then keep `if (pollStore.currentPoll) hydrateFromPoll(pollStore.currentPoll)` and `loaded.value = true`. `submit()` is shape C (update-then-redirect) — it already assigns via `store.update` (now shape A, which write-throughs + hydrates) then `router.push`; leave `submit()` as-is (the post-update `hydrateFromPoll` re-hydrates the form ids and the redirect navigates away — no extra refetch needed).

11. **Update `pollStore.spec.ts` — `complete`.** In "POSTs { finalSlotId }, swaps in the completed poll, and re-fetches results": the post-complete refresh is now `hydrateDerived` (three parallel loads), not a single `loadResults`. Change the supplementary mocks to serve all three: keep `post.mockResolvedValueOnce(completed)`, then `get.mockImplementation((path) => path.endsWith('/results') ? Promise.resolve({ best: null, slots: [] }) : path.includes('invite-message') ? Promise.resolve({ message: '', shareUrl: 'u' }) : Promise.resolve(null))` and `getParticipantResponses.mockResolvedValue({ participants: [], total: 0, hasMore: false })`. Assert `get` was called with `/public/polls/tok/results` AND `/polls/42/invite-message`, and `getParticipantResponses` was called with `('tok', undefined, undefined)`. Keep the `completeError`/`completing` assertions.

12. **Update `pollStore.spec.ts` — `update`.** Apply the same multi-load mock pattern (steps 11) to the three `update` success tests ("PATCHes the payload...", "expresses invalidation..."). For the happy-path test add a write-through assertion: seed `store.polls = [{ id: '42', status: 'open' } as ...]` before the call and assert `store.polls[0].status === 'open'` stays consistent / `title` patches to `'New'` after the PATCH resolves a poll with `title:'New'`. The 409/400 rejection tests need no mock change (the mutation throws before `hydrateDerived`).

13. **Update `pollStore.spec.ts` — `cancel`/`reopen`.** Replace the single `get.mockResolvedValueOnce({ best: null, slots: [] })` with the multi-load mock (results + invite via `get.mockImplementation`, participants via `getParticipantResponses.mockResolvedValue`). Assert the supplementary loads fire (`get` called with `/polls/42/invite-message`, `getParticipantResponses` called) — this is the regression guard for the floating-promise + stale-invite bugs. Add a write-through assertion to the `cancel` happy path: seed `store.polls = [{ id: '42', status: 'open' } as ...]`, then after `await store.cancel('42')` assert `store.polls[0].status === 'cancelled'`.

14. **Add a `pollStore.loadDetail` describe block to `pollStore.spec.ts`.** New tests: (a) `loadDetail('42')` GETs `/polls/42`, sets `currentPoll`, then fires the three supplementary loads (`/results`, `/polls/42/invite-message`, `getParticipantResponses`) — mock all four; (b) when the detail GET 404s (`get.mockRejectedValueOnce(new ApiError(404, null))`), `currentPoll` stays null, `detailError === 'Poll not found'`, and the supplementary loads are NOT attempted (assert `getParticipantResponses` not called) since `hydrateDerived` no-ops on null. Also add a one-line guard test asserting `refreshPoll` is gone: `expect((store as Record<string, unknown>).refreshPoll).toBeUndefined()`.

15. **Verify `PollManage.spec.ts` still passes under the orchestrator.** The existing `mountWithPoll` `get.mockImplementation` already serves `/polls/42`, `/results`, `participants-responses`, and `invite-message`, so mount via `loadDetail` resolves all four with no edit. Confirm the lifecycle dialog tests still pass: `confirmCancel`/`confirmReopen` now `await` a mutation that runs `hydrateDerived` after the POST — those follow-up GETs already have implementations from `mountWithPoll`, and the `post.mockResolvedValueOnce(makePoll({...}))` lines stay. If any lifecycle test asserts call ordering/counts on `get`, relax it to `toHaveBeenCalledWith` (the post-mutation hydrate adds GET calls). Add one assertion to the open-poll mount test: `expect(getParticipantResponses ...)` — actually skip if `getParticipantResponses` isn't imported in this spec; only the store spec needs that guard.

## Verification
- `npm run format`
- `npm run lint`
- `npm run type-check`
- `npm run test:unit -- run src/stores/__tests__/pollStore.spec.ts src/views/__tests__/PollManage.spec.ts src/views/__tests__/PollEditor.spec.ts`
- Manual UI check (dev server): on `/polls/:id`, click Cancel poll → confirm → the manage page status pill flips to "Cancelled" WITHOUT flashing the "Loading poll…" skeleton, and the Cancel button stops spinning only once the bloom/matrix reflect the new state; then navigate back to `/dashboard` and confirm the poll's card shows "Cancelled" without a refetch. Repeat for Reopen and for Complete (status → "Completed", invite text + participant matrix stay fresh).

## Acceptance
- [x] `pollStore.ts` exposes `loadDetail` and no longer exposes `refreshPoll`; `hydrateDerived` + `patchListRow` exist and are private (not in the returned object).
- [x] `complete`/`update`/`cancel`/`reopen` each assign the server-returned `OwnedPoll`, then `patchListRow(...)` + `await hydrateDerived()`; none call `loadResults` directly and none reference `refreshPoll`; no floating promise remains in `cancel`/`reopen`.
- [x] `PollManage.vue` `onMounted` `await`s `store.loadDetail(id.value)` (no `route.params.id as string`); `PollEditor.vue` edit-mode `onMounted` `await`s `pollStore.loadDetail(editId.value!)`.
- [x] Store spec asserts each mutation refetches results + participants + invite (not just results) and write-throughs the `polls[]` row; a `loadDetail` describe covers success + 404-no-hydrate; a guard asserts `refreshPoll` is undefined.
- [x] All four verification commands are green; the manage page does not flash its loading skeleton on cancel/reopen/complete.
