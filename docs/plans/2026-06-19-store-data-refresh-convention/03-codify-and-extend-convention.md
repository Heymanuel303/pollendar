# Phase 3: codify-and-extend-convention

**Plan:** [store-data-refresh-convention](00-overview.md)
**Depends on:** 02-public-store-refresh-convention.md
**Execution:** workflow

## Context
The feature standardizes how Pinia stores refresh data after state changes: in-place mutations assign
the server-returned entity then `await` ONE derived-slice refresher (no loading flash, no double-fetch);
cold loads use ONE orchestrator that resets+fetches; delete/navigate-away mutations prune local caches;
list caches get write-through patches. Phases 1 and 2 applied this to `pollStore.ts` (+ `PollManage.vue`,
`Dashboard.vue`, `PollEditor.vue`) and `publicPollStore.ts` (+ `PublicPoll.vue`, `PublicThanks.vue`).
This final phase makes the standard durable and app-wide: it documents the convention authoritatively in
`frontend/README.md`, then audits every remaining store/view (`authStore.ts` and all store-consuming
views/router/entry points) against that documented standard and fixes any stragglers so the convention
holds everywhere.

## Objective
Add an authoritative "State management & data refresh" section to `frontend/README.md` and audit + fix
every remaining store and store-consuming view so the three-shape refresh convention is satisfied
uniformly across the frontend.

## Files to touch
- `frontend/README.md` — add a "State management & data refresh" section codifying the three mutation
  shapes (A in-place + `hydrateDerived`, B cold-load orchestrator, C delete/navigate-away prune) and the
  uniformity rules; this is the single serial step, done first.
- `frontend/src/stores/authStore.ts` — audit only. It is a session-probe store with no entity/derived
  slices, so the RequestState/derived-refresher machinery does NOT apply (see gotcha). Confirm it conforms
  to the documented "stores that probe a session are exempt" carve-out; change only if it calls a cold-load
  getter after a session mutation in a way that contradicts the doc.
- `frontend/src/stores/pollStore.ts` — verification re-read (changed in Phase 1). Confirm no `refreshPoll`
  remains on the public store surface, exactly one private `hydrateDerived`-style refresher exists, every
  in-place mutation (`complete`, `update`, `cancel`, `reopen`) awaits it, `remove` prunes caches, and the
  Dashboard `polls[]` row is write-through patched. Fix any straggler the conformance pass flags.
- `frontend/src/stores/publicPollStore.ts` — verification re-read (changed in Phase 2). Confirm `submit`
  follows shape C (no post-submit cold reload) and `load` is the single cold-load orchestrator. Fix
  stragglers.
- `frontend/src/views/PollManage.vue` — verification re-read. Confirm `onMounted` `await`s exactly one
  orchestrator using the `id` computed (line 41), not `store.refreshPoll(route.params.id as string)`
  (current line 44). Fix if Phase 1 left it.
- `frontend/src/views/PollEditor.vue` — audit. Confirm edit-mode `onMounted` (line 98) `await`s the single
  cold-load orchestrator via the `editId`/`isEdit` computed, and clears `detailError` before mount so a
  stale error never flashes between route changes (gotcha). Fix if needed.
- `frontend/src/views/Dashboard.vue` — audit. `onMounted(() => pollStore.list())` (line 14): confirm it is
  a single cold-load call and matches the documented "list cold load" shape. No multi-call orchestration.
- `frontend/src/views/PublicPoll.vue` — verification re-read. Confirm `onMounted` (lines 35-42) calls ONLY
  the single public cold-load orchestrator, not the chained `load`/`loadResults`/`loadParticipants` trio,
  and `submit` (line 88) follows shape C.
- `frontend/src/views/PublicThanks.vue` — verification re-read. Confirm `onMounted` (lines 26-28) calls ONLY
  the single public cold-load orchestrator, not the `Promise.all([load, loadResults])` chain.
- `frontend/src/views/AuthCallback.vue` — audit only. `auth.verify(token)` (line 22) then router redirect is
  a shape-C navigate-away flow; confirm it conforms. No derived slices to refresh.
- `frontend/src/router/index.ts` — audit only. `auth.bootstrap()` / `auth.tryRefresh()` (lines 65, 69) are
  session probes, not entity refreshes; confirm exempt per the doc. No change expected.
- `frontend/src/main.ts` — audit only. `useAuthStore().clearSession()` in the unauthorized handler (line 29)
  is a session prune; confirm exempt. No change expected.
- Matching `__tests__` specs for any file actually changed in this phase
  (`src/stores/__tests__/authStore.spec.ts`, `src/views/__tests__/PollEditor.spec.ts`,
  `src/views/__tests__/Dashboard.spec.ts`, and any store/view spec for a straggler fix). Update assertions
  so they pin the documented behavior (e.g. onMounted calls the single orchestrator, not the raw trio).

## Steps

### Serial step (do this FIRST, single writer — no concurrent doc edits)
1. In `frontend/README.md`, add a new top-level section titled `## State management & data refresh`,
   placed after `## Run` (line 36) and before `## Build`. Write it as the authoritative spec, covering:
   - **Setup-style Pinia stores** with `ref`-based state (not getters), consumed in templates via
     `storeToRefs`. Keep the existing `RequestState` (`'idle' | 'loading' | 'success' | 'error'`) lifecycle
     refs, error refs, and message-mapping helpers (`messageFor`, `completeMessageFor`, `updateMessageFor`,
     `removeMessageFor`, `lifecycleMessageFor`) — this convention governs refresh orchestration only, not
     error handling.
   - **The three mutation shapes** every state-changing flow falls into EXACTLY ONE of:
     - **A) Mutation that returns the updated entity** (`POST /:id/complete|cancel|reopen`, `PATCH /:id`):
       assign the server-returned entity straight into the current-entity ref
       (`currentPoll.value = await apiPost(...)`), then `await` ONE private derived-slice refresher
       (`hydrateDerived()`-style) that re-hydrates the derived slices (live results/tallies, participant
       rows, invite text) in parallel, each swallowing its own error (they are supplementary). NEVER call
       the cold-load getter right after a mutation (it nulls the entity the server just returned — a wasted
       round-trip — and flashes the loading skeleton). Keep loading/error refs awaited so the `finally` that
       clears the in-flight flag runs AFTER the derived refresh resolves (no floating promise). If a list
       cache also holds the entity (the dashboard `polls[]`), write-through patch the matching row from the
       returned entity, mapping detail-entity fields into the lighter list-row shape.
     - **B) Cold load** (component mount / route navigation): ONE public orchestrator
       (`loadDetail()`-style) that resets the current-entity ref to `null` (skeleton is correct here),
       fetches the entity, then `await`s the SAME derived-slice refresher from (A). Detail views call ONLY
       this one orchestrator in `onMounted`, using the view's existing route-id computed — never a raw
       `route.params.id as string`, and never the individual loaders chained by hand.
     - **C) Delete / navigate-away** (`DELETE`, submit-then-redirect, create-then-redirect): prune local
       caches (drop the row from any list, clear the detail slice) and navigate. No refetch — nothing is
       left to re-hydrate.
   - **Uniformity rules:** exactly ONE private derived refresher per store (every in-place mutation calls
     it — never an ad-hoc subset; add a slice once and every mutation stays correct); exactly ONE public
     cold-load orchestrator per detail view (`onMounted` calls only it); views never orchestrate multi-call
     refreshes and never call raw getters/loaders directly to refresh; no ad-hoc one-off refreshers on the
     public store surface (the former `pollStore.refreshPoll` is gone). Views clear error refs BEFORE
     opening dialogs so a stale message never flashes (PollManage does this around lines 91-93/112-114).
   - **Session-probe exemption:** `authStore` only probes/clears the session (`bootstrap`, `tryRefresh`,
     `me`, `clearSession`, `logout`, `verify`, `requestLink`); it owns no entity or derived slices, so it
     does NOT use the RequestState/derived-refresher machinery and stays simple. Document this carve-out
     explicitly so future readers do not retrofit the pattern onto it.

### Fan-out: read-only conformance pass (one agent per store / per store-consuming view), THEN fix flagged files
2. **pollStore.ts conformance:** re-read `src/stores/pollStore.ts`. Verify: `refreshPoll` is NOT in the
   returned public object (was at line 384) — it must be a private `hydrateDerived`-style fn; `complete`
   (~line 255), `update` (~277), `cancel` (~320), `reopen` (~340) each assign `currentPoll.value = await
   apiPost/apiPatch(...)` then `await` the derived refresher (NOT a bare `loadResults`, NOT an unawaited
   `refreshPoll`); the derived refresher hydrates results + participants + invite in parallel; `complete`
   and `update` write-through patch the matching `polls[]` row from the returned `OwnedPoll` (mapping into
   the lighter `Poll` list-row scalars — `Poll` is defined at lines 40-59 of pollStore vs `Poll` in
   `lib/api/types.ts` lines 84-98, no `dates[]`); `remove` (~298) filters `polls[]` and clears the detail
   slice. If anything is still ad-hoc (Phase 1 incomplete), fix it in place and update
   `src/stores/__tests__/pollStore.spec.ts` to assert the derived set is refreshed and the list row is
   patched after `complete`/`update`/`cancel`/`reopen`.
3. **publicPollStore.ts conformance:** re-read `src/stores/publicPollStore.ts`. Verify `load(token)` is the
   single cold-load orchestrator (resets `poll`/`results`/`participants`, fetches, hydrates derived) and
   `submit(token, payload)` follows shape C (no cold reload afterward; the view redirects to PublicThanks).
   Confirm `resetError()` semantics are unchanged (still called by `load`/`submit`, intentionally not by the
   supplementary loaders). Fix stragglers and update `src/stores/__tests__/publicPollStore.spec.ts`.
4. **authStore.ts conformance:** re-read `src/stores/authStore.ts`. Confirm it conforms to the session-probe
   exemption: no entity ref, no derived slices, no cold-load getter called after a session mutation. Expected
   outcome: NO code change. Only if it violates the doc (e.g. a redundant `me()` cold-probe immediately after
   `verify()` that throws away verify's result) fix it and update `src/stores/__tests__/authStore.spec.ts`.
5. **PollManage.vue conformance:** re-read `src/views/PollManage.vue`. Verify `onMounted` (line 43) `await`s
   exactly one cold-load orchestrator passing the `id` computed (line 41), NOT
   `store.refreshPoll(route.params.id as string)` (current line 44). Verify `complete`/`cancel`/`reopen`/
   `remove` handlers (lines 98/119/134/149) clear their error ref before the call. Fix stragglers; update
   `src/views/__tests__/PollManage.spec.ts` to assert the single-orchestrator mount call.
6. **PollEditor.vue conformance:** re-read `src/views/PollEditor.vue`. Verify edit-mode `onMounted` (line 98)
   `await`s the single cold-load orchestrator via the `isEdit`/`editId` computed (lines 33-35), and clears
   `detailError` before fetching so a stale error from a prior route does not flash (gotcha). Create mode
   stays as-is. Fix if needed; update `src/views/__tests__/PollEditor.spec.ts`.
7. **Dashboard.vue conformance:** re-read `src/views/Dashboard.vue`. Verify `onMounted(() =>
   pollStore.list())` (line 14) is a single cold-load list fetch with no hand-rolled multi-call refresh and
   no post-mutation reload. Expected outcome: no change. Update `src/views/__tests__/Dashboard.spec.ts` only
   if a fix is made.
8. **PublicPoll.vue conformance:** re-read `src/views/PublicPoll.vue`. Verify `onMounted` (lines 35-42) calls
   ONLY the single public cold-load orchestrator — NOT the separate `store.load` / `store.loadResults` /
   `store.loadParticipants` chain — using the `token` computed (line 23), and `submit` (line 88) follows
   shape C (redirect, no reload). Fix stragglers; update `src/views/__tests__/PublicPoll.spec.ts`.
9. **PublicThanks.vue conformance:** re-read `src/views/PublicThanks.vue`. Verify `onMounted` (lines 26-28)
   calls ONLY the single public cold-load orchestrator — NOT `Promise.all([store.load(token),
   store.loadResults(token)])` — using the `token` computed (line 20). Fix stragglers; update
   `src/views/__tests__/PublicThanks.spec.ts`.
10. **AuthCallback.vue + router + main.ts conformance:** re-read `src/views/AuthCallback.vue` (verify line 22
    `auth.verify(token)` then redirect = shape C), `src/router/index.ts` (verify lines 65/69 `bootstrap`/
    `tryRefresh` are session probes, exempt), `src/main.ts` (verify line 29 `clearSession()` is a session
    prune, exempt). Expected outcome: no change. Only fix + update `src/views/__tests__/AuthCallback.spec.ts`
    if a real deviation from the documented standard is found.

### Converge
11. For every file that was actually changed in steps 2-10, re-check it against the README section written in
    step 1 (the documented standard is the source of truth), then run the full verification below until green.

## Execution strategy
- **Serial first:** step 1 (the README codification) is the single serial step — one writer, no concurrent
  edits to the shared doc. It must land before fan-out so every conformance agent checks against the same
  written standard.
- **Fan-out unit:** one agent per store / per store-consuming view for the conformance pass (steps 2-10).
  Each agent first reads its file read-only and flags deviations from the README standard, then fixes only
  its own file and its matching spec.
- **Shape:** find -> transform -> verify. Discovery = which files deviate from the documented convention;
  transform = fix each flagged file in place; verify = re-check the fix against the doc.
- **Isolation:** none required — each agent edits a distinct source file plus its distinct `__tests__` spec.
  The only shared artifact is `README.md`, edited solely in the serial step 1 before any fan-out.
- **Verify stage:** after fixes, re-run lint + type-check + the affected specs (and a full `test:unit` run at
  the end). Re-confirm no view chains raw loaders and no mutation flashes the skeleton.

## Verification
Run from the `frontend/` directory:
- `npm run format`
- `npm run lint`
- `npm run type-check`
- `npm run test:unit -- run src/stores src/views` (scope to the touched store + view specs; run the full
  `npm run test:unit -- run` once at the end)
- Manual UI check: complete/update/cancel/reopen on the manage page updates results + participants + invite
  text and the dashboard row's status without flashing the loading skeleton; navigating back to a detail/edit
  view does NOT flash a stale error; magic-link verify + logout still work (authStore unchanged).

## Acceptance
- [x] `frontend/README.md` has a `## State management & data refresh` section that authoritatively documents
      the three mutation shapes (A in-place + single `hydrateDerived` refresher, B single cold-load
      orchestrator, C delete/navigate-away prune), the uniformity rules, and the `authStore` session-probe
      exemption.
- [x] No store on its public surface exposes an ad-hoc one-off refresher (no `pollStore.refreshPoll`); each
      store has exactly one private derived-slice refresher that every in-place mutation awaits.
- [x] Every detail view's `onMounted` calls exactly ONE cold-load orchestrator (via its route-id computed),
      not a hand-chained set of loaders or a raw `route.params.id as string`
      (`PollManage`, `PollEditor`, `PublicPoll`, `PublicThanks`).
- [x] `authStore.ts`, `router/index.ts`, `main.ts`, and `AuthCallback.vue` are confirmed conforming under the
      documented session-probe carve-out (no RequestState/derived machinery forced on them).
- [x] `npm run format`, `npm run lint`, `npm run type-check`, and `npm run test:unit -- run` all pass.
