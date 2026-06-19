# Phase 2: public-store-refresh-convention

**Plan:** [store-data-refresh-convention](00-overview.md)
**Depends on:** 01-pollstore-refresh-convention.md
**Execution:** solo
**Status:** completed

## Context
This plan standardizes how Pinia stores refresh data after state changes across the Vue frontend: in-place mutations re-hydrate only derived slices (no loading flash, no double-fetch), cold loads use one orchestrator that resets+fetches, and delete/navigate-away mutations prune caches. Phase 1 applied the convention to the owned-poll store (`pollStore.ts`) and `PollManage.vue`. This phase applies the IDENTICAL convention to the anonymous public flow: the `publicPollStore` and its `PublicPoll`/`PublicThanks` views currently chain three loaders (`load` + `loadResults` + `loadParticipants`) in `onMounted`, which this phase consolidates behind a single cold-load orchestrator (shape B). The public store has no in-place mutations (shape A) — `submit` is a navigate-away (shape C) and only needs to be confirmed, not changed.

## Objective
Add one public cold-load orchestrator (`loadDetail`) to `publicPollStore` plus a private derived-slice refresher (`hydrateDerived`), repoint `PublicPoll.vue`/`PublicThanks.vue` `onMounted` at it, and update the specs — without touching `errorCode`/`errorMessage` handling or the `submit` (shape C) flow.

## Files to touch
- `frontend/src/stores/publicPollStore.ts` — add a private `hydrateDerived(token)` that runs `loadResults` + `loadParticipants` in parallel (each already non-fatal); add a public `loadDetail(token)` orchestrator that resets `poll`/`results`/`participants` (skeleton is correct on a cold load), calls `load(token)`, then `await`s `hydrateDerived(token)`; expose `loadDetail` on the returned object. Leave `submit` (shape C) unchanged.
- `frontend/src/views/PublicPoll.vue` — replace the chained `onMounted` (`store.load` → `store.loadResults` → `store.loadParticipants`) with a single `await store.loadDetail(token.value)`; keep the `getViewMode` tab restore. `onSubmit` (shape C) stays as-is.
- `frontend/src/views/PublicThanks.vue` — replace the `Promise.all([store.load, store.loadResults])` in `onMounted` with a single `await store.loadDetail(token.value)`.
- `frontend/src/stores/__tests__/publicPollStore.spec.ts` — add a `describe('publicPollStore.loadDetail')` block; keep the existing `load`/`submit`/`loadResults`/`loadParticipants` blocks intact.
- `frontend/src/views/__tests__/PublicPoll.spec.ts` — update mount mocks/assertions for the single-orchestrator path (the three api stubs still resolve, so `mountWithPoll` keeps working; add an assertion that all three are called once).
- `frontend/src/views/__tests__/PublicThanks.spec.ts` — does NOT exist yet; CREATE it to cover the `loadDetail`-on-mount path and the best-slot/no-results rendering.
- `frontend/README.md` — no edit in this phase; the convention is codified once in the final phase. (Listed here only to note it is intentionally untouched.)

## Steps

1. In `frontend/src/stores/publicPollStore.ts`, add a private helper just below `loadParticipants` (before `applyError`):
   ```ts
   /**
    * Re-hydrate the derived slices that hang off the current poll (live results + participant rows)
    * in parallel. Each call is independently non-fatal — `loadResults`/`loadParticipants` swallow
    * their own errors — so a failure in one does not block the other or the caller.
    */
   async function hydrateDerived(token: string): Promise<void> {
     await Promise.all([loadResults(token), loadParticipants(token)])
   }
   ```
   This is the single derived-slice refresher for this store (mirrors `hydrateDerived` added to `pollStore` in Phase 1). `loadResults` and `loadParticipants` are unchanged (still non-fatal, still set their own state).

2. In the same file, add the public cold-load orchestrator just below `hydrateDerived`:
   ```ts
   /**
    * Cold-load orchestrator for the public detail views (component mount / share-link arrival): reset
    * the entity + derived slices so the view shows its skeleton, fetch the poll, then await the derived
    * refresher. The ONLY entry point `PublicPoll`/`PublicThanks` call in `onMounted` — they never chain
    * the individual loaders themselves.
    */
   async function loadDetail(token: string): Promise<void> {
     poll.value = null
     results.value = null
     participants.value = []
     participantsTotal.value = 0
     participantsHasMore.value = false
     await load(token)
     await hydrateDerived(token)
   }
   ```
   `load(token)` already sets `loadState`/`errorCode`/`errorMessage` and resets `poll` on failure; do NOT add extra error handling here (preserves the existing `errorCode`/`errorMessage` contract). The null-reset is correct ONLY here (cold load), never after a mutation.

3. In the same file, add `loadDetail` to the returned object (right after `load`), keeping `load`, `submit`, `loadResults`, `loadParticipants` exposed (views/specs still call `load`/`loadResults`/`loadParticipants` directly in some paths, and the existing spec exercises them):
   ```ts
   return {
     poll,
     results,
     participants,
     participantsTotal,
     participantsHasMore,
     participantsState,
     loadState,
     submitState,
     errorCode,
     errorMessage,
     load,
     loadDetail,
     submit,
     loadResults,
     loadParticipants,
   }
   ```
   Do NOT expose `hydrateDerived` (private, like the convention requires). Leave `resetError`/`applyError`/`messageFor` exactly as they are.

4. In `frontend/src/views/PublicPoll.vue`, replace the chained `onMounted` body (currently lines ~35-43: `await store.load(token.value)` → `getViewMode` → `await store.loadResults(token.value)` → `await store.loadParticipants(token.value)`) with the single orchestrator, keeping the tab restore:
   ```ts
   onMounted(async () => {
     // One cold-load orchestrator: fetches the poll then hydrates results + participant rows in parallel.
     await store.loadDetail(token.value)
     // Restore the last-used tab for this poll (per-device), defaulting to Vote.
     view.value = getViewMode(token.value) ?? 'vote'
   })
   ```
   Leave `onSubmit` untouched — `store.submit(...)` then `router.push('/p/:token/done')` is the correct shape C (navigate-away; nothing left to re-hydrate, the participant token is persisted by `submit`). Leave the `storeToRefs` destructure and all computeds unchanged.

5. In `frontend/src/views/PublicThanks.vue`, replace the `onMounted` body (currently line ~28: `await Promise.all([store.load(token.value), store.loadResults(token.value)])`) with:
   ```ts
   onMounted(async () => {
     // One cold-load orchestrator: title/timezone for a cold share-link arrival + results for the bloom.
     await store.loadDetail(token.value)
   })
   ```
   This view does not render the participant matrix, but the orchestrator harmlessly hydrates `participants` too — consistency over a second public loader. Leave the `storeToRefs` destructure (`poll`, `results`) and the `best`/`bestHeading`/`hasEditToken` computeds unchanged.

6. In `frontend/src/stores/__tests__/publicPollStore.spec.ts`, append a new describe block (keep all existing blocks). It reuses the hoisted `getPublicPoll`/`getResults`/`getParticipantResponses` mocks:
   ```ts
   describe('publicPollStore.loadDetail', () => {
     it('fetches the poll then hydrates results + participants in one call', async () => {
       getPublicPoll.mockResolvedValue({ id: '1', title: 'Dinner', timezone: 'Europe/Brussels', dates: [] })
       getResults.mockResolvedValue({ best: { slotId: '9', date: '2026-06-26', label: 'Early', score: 6 }, slots: [] })
       getParticipantResponses.mockResolvedValue({
         participants: [{ participantId: '5', displayName: 'Sam', answers: [] }],
         total: 1,
         hasMore: false,
       })
       const store = usePublicPollStore()

       await store.loadDetail('share-token')

       expect(getPublicPoll).toHaveBeenCalledWith('share-token')
       expect(getResults).toHaveBeenCalledWith('share-token')
       expect(getParticipantResponses).toHaveBeenCalledWith('share-token', undefined, undefined)
       expect(store.poll).toMatchObject({ id: '1', title: 'Dinner' })
       expect(store.results?.best?.slotId).toBe('9')
       expect(store.participants).toHaveLength(1)
       expect(store.loadState).toBe('success')
     })

     it('still resolves the poll when the derived loads fail (non-fatal)', async () => {
       getPublicPoll.mockResolvedValue({ id: '1', title: 'Dinner', timezone: 'Europe/Brussels', dates: [] })
       getResults.mockRejectedValue(new ApiError(404, { message: 'Not Found' }))
       getParticipantResponses.mockRejectedValue(new ApiError(404, { message: 'Not Found' }))
       const store = usePublicPollStore()

       await expect(store.loadDetail('share-token')).resolves.toBeUndefined()

       expect(store.poll).toMatchObject({ id: '1' })
       expect(store.loadState).toBe('success')
       expect(store.results).toBeNull()
       expect(store.participants).toEqual([])
     })

     it('clears the poll and records the error when the poll fetch 404s', async () => {
       getPublicPoll.mockRejectedValue(new ApiError(404, { message: 'Not Found' }))
       getResults.mockResolvedValue({ best: null, slots: [] })
       getParticipantResponses.mockResolvedValue({ participants: [], total: 0, hasMore: false })
       const store = usePublicPollStore()

       await store.loadDetail('nope')

       expect(store.poll).toBeNull()
       expect(store.loadState).toBe('error')
       expect(store.errorCode).toBe(404)
     })
   })
   ```

7. In `frontend/src/views/__tests__/PublicPoll.spec.ts`, the existing `mountWithPoll` helper already stubs `getPublicPoll`/`getResults`/`getParticipantResponses` and `flushPromises()`, so it keeps working unchanged against `loadDetail`. Add one test inside `describe('PublicPoll — open state')` (or a new describe) asserting the orchestrator drove all three fetches on mount:
   ```ts
   it('drives a single cold load that fetches poll + results + participants once', async () => {
     await mountWithPoll(makePublicPoll({ status: 'open' }))
     expect(getPublicPoll).toHaveBeenCalledTimes(1)
     expect(getResults).toHaveBeenCalledTimes(1)
     expect(getParticipantResponses).toHaveBeenCalledTimes(1)
     expect(getPublicPoll).toHaveBeenCalledWith('tok')
   })
   ```
   No other change to this spec — the `vue-router` mock (`useRoute` returns `{ params: { publicToken: 'tok' } }`, `useRouter` returns `{ push }`) and the closed/open render tests are unaffected.

8. Create `frontend/src/views/__tests__/PublicThanks.spec.ts` mirroring the `PublicPoll.spec.ts` setup (hoisted api mocks, `vi.mock('@/lib/api/public-poll', importOriginal spread)`, `vue-router` mock with `useRoute` returning `{ params: { publicToken: 'tok' }, query: { name: 'Sam' } }`, `setActivePinia(createPinia())` + `vi.clearAllMocks()` per `beforeEach`). Also stub `@/lib/participantToken`'s `getParticipantToken` (returns `null` by default) since the view reads it for the "Edit my response" link. Cover:
   - On mount, `loadDetail` drove all three fetches once: `getPublicPoll`/`getResults`/`getParticipantResponses` each called once with `'tok'`.
   - With a `best` in results, the bloom card renders (`'In bloom'` / `bestHeading` text present).
   - With `getResults` resolving `{ best: null, slots: [] }`, the bloom section is hidden (`v-if="best"`), while the share section still renders (`'Copy link'`).
   - The query `name` echoes in the hero (`'Thanks Sam'`).
   Stub `CopyButton` (`global.stubs: { CopyButton: true, RouterLink: RouterLinkStub }`) to avoid clipboard wiring. Use `flushPromises()` after `mount` to let `loadDetail` settle.

## Verification
Run from the `frontend/` directory:
- `npm run format`
- `npm run lint`
- `npm run type-check`
- `npm run test:unit -- run src/stores/__tests__/publicPollStore.spec.ts src/views/__tests__/PublicPoll.spec.ts src/views/__tests__/PublicThanks.spec.ts`
- Manual UI check: open `/p/:token` and `/p/:token/done` cold — the poll, live results, and participant matrix all render with a single skeleton pass (no double-fetch, no flash); submitting on `/p/:token` still navigates to `/done` with the bloom and a persisted edit token (shape C unchanged).

## Acceptance
- [x] `publicPollStore` exposes one public `loadDetail(token)` orchestrator and a private `hydrateDerived(token)`; `PublicPoll.vue` and `PublicThanks.vue` `onMounted` each call ONLY `store.loadDetail(token.value)` (no chained `load`/`loadResults`/`loadParticipants`).
- [x] `submit` (shape C) and the `errorCode`/`errorMessage`/`messageFor` handling are unchanged; `hydrateDerived` is not on the public store surface.
- [x] `publicPollStore.spec.ts` has a passing `loadDetail` block, `PublicPoll.spec.ts` asserts the single cold load, and a new `PublicThanks.spec.ts` covers the mount + bloom/no-results paths; all listed verification commands pass green.
