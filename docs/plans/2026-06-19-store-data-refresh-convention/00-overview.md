# Store data-refresh convention

**Slug:** `store-data-refresh-convention` (folder: `docs/plans/2026-06-19-store-data-refresh-convention/`)
**Created:** 2026-06-19
**Status:** completed

## Goal
Standardize how the Vue frontend's Pinia stores refresh data after a state change, so every action across the app follows one predictable shape. Today it is inconsistent: `pollStore.complete`/`update` refresh only `loadResults` (invite text + participant rows go stale, and the dashboard `polls[]` row keeps its old status), while `cancel`/`reopen` call an un-awaited `refreshPoll` that routes through `get()` — nulling `currentPoll` and re-fetching the entity the server just returned (a skeleton flash + a wasted round-trip, with the button spinner clearing before data is fresh).

The standard — three mutually exclusive shapes:
- **A — in-place mutation** (endpoint returns the updated entity): assign the returned entity, then `await` one private derived-slice refresher (`hydrateDerived()`); never re-call the cold-load getter; write-through any list cache holding the entity.
- **B — cold load** (mount / navigation): one public orchestrator (`loadDetail()`) that resets→fetches→awaits the same refresher; `onMounted` calls only it.
- **C — delete / navigate-away**: prune local caches and navigate; no refetch.

## Scope
- `frontend/src/stores/pollStore.ts` — `hydrateDerived()` + `patchListRow()` (private) + `loadDetail()` (public); `complete`/`update`/`cancel`/`reopen` → assign-then-`await hydrateDerived` + list write-through; remove `refreshPoll`.
- `frontend/src/stores/publicPollStore.ts` — mirror with `hydrateDerived(token)` + `loadDetail(token)`.
- `frontend/src/stores/authStore.ts` — audit only (session-probe carve-out; no entity/derived slices).
- Consuming views — `PollManage.vue`, `PollEditor.vue`, `PublicPoll.vue`, `PublicThanks.vue` `onMounted` → single orchestrator; `Dashboard.vue`, `AuthCallback.vue`, `router/index.ts`, `main.ts` audited.
- `frontend/README.md` — single authoritative "State management & data refresh" section (Phase 3 only).
- Matching `__tests__` specs for every changed file (incl. a new `PublicThanks.spec.ts`).

## Out of scope
- Any backend/API change or new endpoint — the refresh orchestration uses existing endpoints only.
- Error-handling refactors: `RequestState` lifecycle refs, error refs, and message-mapping helpers stay as-is (this governs refresh orchestration only).
- Non-store global/local state.

## Constraints
- No backend changes; keep setup-style Pinia stores; TypeScript strict.
- No UX regression: an in-place mutation must not flash the view through its loading skeleton, and a button's spinner clears only once data is fresh (no floating promises).
- Each phase ends on a green `format` / `lint` / `type-check` / `test:unit` run.

## Acceptance criteria
- [x] Every store exposes exactly one public cold-load orchestrator per detail view and no ad-hoc one-off refresher (`pollStore.refreshPoll` removed); exactly one private derived refresher per store that every in-place mutation awaits.
- [x] `complete`/`update`/`cancel`/`reopen` assign the returned entity, `await hydrateDerived()`, and write-through the `polls[]` row; no `loadResults`-only refresh, no floating promise.
- [x] Every detail view's `onMounted` calls only its orchestrator via the existing route-id computed (no `route.params.id as string`, no hand-chained loaders).
- [x] `authStore`/`router`/`main.ts`/`AuthCallback.vue` confirmed conforming under the documented session-probe exemption.
- [x] `frontend/README.md` documents the three shapes + uniformity rules + the session-probe carve-out.
- [x] `npm run format`, `npm run lint`, `npm run type-check`, `npm run test:unit -- run` all green.

## Phases
1. [01-pollstore-refresh-convention](01-pollstore-refresh-convention.md) — reference implementation in `pollStore` + `PollManage`/`PollEditor`: `hydrateDerived`/`patchListRow`/`loadDetail`, uniform shape-A mutations, drop `refreshPoll`, update specs · _solo_ ✓
2. [02-public-store-refresh-convention](02-public-store-refresh-convention.md) — mirror the convention in `publicPollStore` + `PublicPoll`/`PublicThanks` (single cold-load orchestrator, new `PublicThanks.spec.ts`) · _solo_ ✓
3. [03-codify-and-extend-convention](03-codify-and-extend-convention.md) — authoritative `README` section, then fan-out conformance audit across `authStore` + every store-consuming view/router/entry point, fixing stragglers · _workflow_ ✓

## Open questions
- **List-cache write-through (`patchListRow`)** is included by default (Phase 1, rule A5) so the dashboard reflects status changes without relying on a re-mount refetch. If you'd rather keep the store thinner and lean on `Dashboard.vue`'s existing `onMounted(list())`, drop step 2 + the write-through calls from Phase 1 — the rest of the convention is unaffected.
