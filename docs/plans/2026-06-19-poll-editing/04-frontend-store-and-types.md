# Phase 4: Frontend store + wire types for poll editing

**Plan:** [poll-editing](00-overview.md)
**Depends on:** [02-backend-poll-mutation-api.md](02-backend-poll-mutation-api.md)
**Execution:** solo

## Context
A poll creator must be able to edit a poll after it goes live without destroying participant votes: add dates/slots, soft-invalidate (deactivate) existing ones while keeping their historical responses, edit scalar fields, and cancel/reopen the poll. Phase 2 established the backend contract: **invalidation travels as an `invalidatedAt` marker inside the `PATCH /api/polls/:id` body** (no separate invalidate/reactivate endpoints); lifecycle is `POST /api/polls/:id/cancel|reopen`; `DELETE /api/polls/:id` removes the poll; and `GET /api/polls/:id` now returns each slot's `_count.responses` + `invalidatedAt`. This phase is the frontend data layer: it teaches the creator-side Pinia store (`pollStore`) to call those endpoints and extends the wire/input types so the new fields and the edit payload are typed. It is purely the store + types tier — the editor/manage/participant UI that consumes these actions lands in Phases 5–6.

## Objective
Add `update()`, `remove()`, `cancel()`, and `reopen()` actions (each with its own loading + error refs and action-specific error mapper) to `pollStore`; add `invalidatedAt` + a per-slot response count to the `PollSlot`/`PollDate` wire types; and add the `UpdatePollPayload` (+ nested `UpdatePollDateInput`/`UpdatePollSlotInput`) edit-payload types. There are **no** `invalidate`/`reactivate` store actions — (de)activation is expressed through `update()`'s `dates` markers.

## Files to touch
- `frontend/src/lib/api/types.ts` — add `invalidatedAt: string | null` to `PollSlot` and `PollDate`; add a per-slot vote-count field to `PollSlot` (`responseCount`/`_count.responses` — match the exact backend shape from Phase 2's enriched `GET /api/polls/:id`).
- `frontend/src/types/poll.ts` — add the editor-side **input** types `UpdatePollPayload` + nested `UpdatePollDateInput`/`UpdatePollSlotInput` (each nested type carries optional `id` + `invalidatedAt`).
- `frontend/src/stores/pollStore.ts` — extend the client import to add `patch`/`del`; add four actions (`update`, `remove`, `cancel`, `reopen`), their loading/error refs, their error mappers; add all new actions + refs to the returned bag.
- `frontend/src/stores/__tests__/pollStore.spec.ts` — extend the `vi.hoisted()` mock block to also mock `patch`/`del`; add `describe` blocks covering each new action (success swap + each documented error code).

## Steps

1. **Wire types — `frontend/src/lib/api/types.ts`.**
   - In `interface PollSlot` (currently lines 26–33, fields `id`/`startTime`/`endTime`/`isAllDay`/`label`/`sortOrder`), add after `sortOrder`:
     ```ts
     /**
      * Soft-invalidation timestamp: `null` while the slot is active, an ISO instant once the creator
      * deactivated it. Invalidated slots keep their historical responses but are hidden from the public
      * voting view, excluded from results/best + the tally cache, and rejected by submission. Reversible:
      * clearing it (sending `invalidatedAt: null` in a `PATCH /polls/:id` `dates` row) reactivates the slot.
      */
     invalidatedAt: string | null
     /**
      * Per-slot response count, present on the CREATOR detail read (`GET /api/polls/:id`, Phase 2's
      * `_count.responses`). The editor uses `> 0` to lock a voted slot from in-place edits. Absent on the
      * sanitized public view. Match the exact field name/shape the backend emits — `responseCount?: number`
      * if Phase 2 flattened it, or `_count?: { responses: number }` if it passed Prisma's `_count` through.
      */
     responseCount?: number
     ```
     (Use whichever of `responseCount` / `_count` Phase 2 actually shipped — confirm against `backend/src/polls/polls.service.ts` `findOneForUser`/`update` return shape before finalizing. Keep it OPTIONAL so the public `PublicPoll` reuse and the list endpoint stay valid.)
   - In `interface PollDate` (currently lines 36–41, fields `id`/`eventDate`/`sortOrder`/`slots`), add the same `invalidatedAt: string | null` field with a parallel doc comment noting that invalidating a date logically invalidates all of its slots.
   - Do NOT touch `PollStatus` (line 8) — the `'open' | 'completed' | 'cancelled'` union is backend-owned and already complete; the frontend only consumes it.
   - Note: the `PublicPoll` shape (lines 44–51) re-uses `PollDate`/`PollSlot`, so it inherits the new fields automatically. The backend public view never emits invalidated dates/slots (Phase 3) and omits `responseCount`; the fields being present-but-optional is harmless and future-proof.

2. **Input payload types — `frontend/src/types/poll.ts`.**
   - This file already documents (lines 9–12) that `closesAt` is PATCH-only and absent from `CreatePollPayload`. Add the edit payload. It mirrors the create input but every scalar is optional (partial patch) and the nested `dates` carry `id` + `invalidatedAt` so the backend diff can match existing rows and receive the (de)activation marker:
     ```ts
     /** One slot in an edit payload. `id` present ⇒ existing row; absent ⇒ brand-new slot. `invalidatedAt`
      *  is a non-null ISO instant to deactivate, `null`/absent to keep active (or reactivate). */
     export interface UpdatePollSlotInput {
       id?: string
       startTime?: string
       endTime?: string
       isAllDay?: boolean
       label?: string
       invalidatedAt?: string | null
     }
     /** One date in an edit payload, with its slots. `id`/`invalidatedAt` semantics as above; invalidating
      *  a date logically invalidates all of its slots. */
     export interface UpdatePollDateInput {
       id?: string
       eventDate: string
       slots: UpdatePollSlotInput[]
       invalidatedAt?: string | null
     }
     /**
      * Body of `PATCH /api/polls/:id`. Every field is optional — send only what changed. Scalar fields
      * (`title`/`description`/`timezone`/`closesAt`) patch in place. `dates`, when present, is the FULL
      * desired nested tree; the backend diffs it against the stored tree by `id`. A date/slot that already
      * has >=1 response is IMMUTABLE in place — to change such a slot the creator marks it `invalidatedAt`
      * and adds a replacement (new row, no `id`). `closesAt` is an ISO instant or `null` to clear it. Only
      * valid while the poll is `open` (backend returns 409 otherwise).
      */
     export interface UpdatePollPayload {
       title?: string
       description?: string | null
       timezone?: string
       closesAt?: string | null
       dates?: UpdatePollDateInput[]
     }
     ```
   - Keep `PollSlotInput`/`PollDateInput`/`CreatePollPayload`/`CreatedPoll` unchanged. (Phase 5 adds form-only tracking fields — `id?`/`invalidatedAt?`/`hasVotes?` — to `PollSlotInput`/`PollDateInput` and maps them into these `Update*` types in its `buildPayload()`; this phase only declares the wire/payload types.)

3. **`pollStore.ts` — extend the client import.** The current import (line 3) is:
   ```ts
   import { ApiError, get as apiGet, post as apiPost } from '@/lib/api/client'
   ```
   Change it to also pull in `patch`/`del`. **First confirm those named exports exist in `frontend/src/lib/api/client.ts`** — if they do not (the file currently exports `get`/`post` only), add minimal `patch`/`del` helpers there mirroring `post` (same credentials/JSON handling; `del` takes no body and must tolerate a 204 No Content via the existing `parseBody`). Then:
   ```ts
   import {
     ApiError,
     get as apiGet,
     post as apiPost,
     patch as apiPatch,
     del as apiDel,
   } from '@/lib/api/client'
   ```

4. **`pollStore.ts` — import the new input type.** The store currently imports `CreatePollPayload, CreatedPoll` from `@/types/poll` (line 4). Add `UpdatePollPayload`:
   ```ts
   import type { CreatePollPayload, CreatedPoll, UpdatePollPayload } from '@/types/poll'
   ```
   (`OwnedPoll` / `PollResults` are already imported from `@/lib/api/types` on lines 5–11; reuse them.)

5. **`pollStore.ts` — add loading/error refs for each new action.** Mirror the per-action ref-separation pattern (lines 56–83: `creating`/`error`, `loading`/`listError`, `completing`/`completeError` — never share refs across concerns). After the `completeError` ref (line 83) and before the `create` action, add:
   ```ts
   /** True while `update()` is in flight (drives the edit form's save button). */
   const updating = ref(false)
   /** `update()` failure as a human-readable message (409 not-open / 400 validation), or `null`. */
   const updateError = ref<string | null>(null)
   /** True while `remove()` is in flight (drives the delete confirm button). */
   const removing = ref(false)
   /** `remove()` failure as a human-readable message, or `null`. */
   const removeError = ref<string | null>(null)
   /** True while a `cancel()`/`reopen()` lifecycle transition is in flight. */
   const lifecycleTransitioning = ref(false)
   /** `cancel()`/`reopen()` failure as a human-readable message, or `null`. */
   const lifecycleError = ref<string | null>(null)
   ```

6. **`pollStore.ts` — add `update()`.** PATCH the scalar fields + full nested tree, swap `currentPoll`, then refresh results (the nested tree change can move the best slot). Mirror the `complete()` post-mutation refresh pattern (lines 175–187 — swap `currentPoll`, then `loadResults(currentPoll.publicToken)`). Place it after `complete()` (after line 187):
   ```ts
   /**
    * Edit an open poll: `PATCH /api/polls/:id` with the changed scalar fields and/or the full desired
    * nested `dates` tree (each row carrying its `id` + `invalidatedAt` marker). On 200 the returned
    * updated poll replaces `currentPoll` and results are re-fetched (a date/slot change can move the best
    * slot). The backend rejects an edit of a poll that is no longer `open` (409) and validation failures
    * (400); both are surfaced as a readable `updateError` and rethrown so the edit view stays reactive.
    * Voted dates/slots are immutable in place server-side — the creator marks them invalidated + re-adds.
    */
   async function update(pollId: string, payload: UpdatePollPayload): Promise<void> {
     updating.value = true
     updateError.value = null
     try {
       currentPoll.value = await apiPatch<OwnedPoll>(`/polls/${pollId}`, payload)
       if (currentPoll.value) await loadResults(currentPoll.value.publicToken)
     } catch (err) {
       updateError.value = updateMessageFor(err)
       throw err
     } finally {
       updating.value = false
     }
   }
   ```

7. **`pollStore.ts` — add `remove()`.** DELETE returns 204 No Content (`del<void>` resolves `undefined`; client.ts `parseBody` handles 204). Clear `currentPoll`/`results`/`invite` on success so the manage view can navigate away to a clean state, and drop the deleted row from the cached `polls` list. Place after `update()`:
   ```ts
   /**
    * Delete an owned poll: `DELETE /api/polls/:id` (204, cascade — votes go with it). On success the
    * detail slice (`currentPoll`/`results`/`invite`) is cleared and the row is dropped from the cached
    * `polls` list so the dashboard reflects the deletion without a re-fetch. A failure records a
    * readable `removeError` and rethrows so the confirm dialog stays reactive.
    */
   async function remove(pollId: string): Promise<void> {
     removing.value = true
     removeError.value = null
     try {
       await apiDel<void>(`/polls/${pollId}`)
       polls.value = polls.value.filter((p) => p.id !== pollId)
       currentPoll.value = null
       results.value = null
       invite.value = null
     } catch (err) {
       removeError.value = removeMessageFor(err)
       throw err
     } finally {
       removing.value = false
     }
   }
   ```

8. **`pollStore.ts` — add `cancel()` and `reopen()`.** Lifecycle transitions: both POST (no body) to the dedicated routes and return the updated `OwnedPoll`; swap `currentPoll` and refresh results (reopen un-hides voting; cancel/reopen change the status the bloom keys off). `reopen()` from `completed` clears `finalSlotId` + `completedAt` server-side — the swapped `currentPoll` reflects that automatically. Place after `remove()`:
   ```ts
   /**
    * Cancel an open poll: `POST /api/polls/:id/cancel` (no body). Transitions status to `cancelled`,
    * which blocks new submissions just like `completed`. On 200 the updated poll replaces `currentPoll`
    * and results are re-fetched. A 409 (not open) is surfaced as `lifecycleError` and rethrown so the
    * confirm dialog stays reactive.
    */
   async function cancel(pollId: string): Promise<void> {
     lifecycleTransitioning.value = true
     lifecycleError.value = null
     try {
       currentPoll.value = await apiPost<OwnedPoll>(`/polls/${pollId}/cancel`)
       if (currentPoll.value) await loadResults(currentPoll.value.publicToken)
     } catch (err) {
       lifecycleError.value = lifecycleMessageFor(err)
       throw err
     } finally {
       lifecycleTransitioning.value = false
     }
   }

   /**
    * Reopen a cancelled OR completed poll: `POST /api/polls/:id/reopen` (no body). Transitions status
    * back to `open` and, from `completed`, clears `finalSlotId` + `completedAt` (the swapped poll
    * reflects this). On 200 the updated poll replaces `currentPoll` and results are re-fetched. A 409
    * (already open) is surfaced as `lifecycleError` and rethrown.
    */
   async function reopen(pollId: string): Promise<void> {
     lifecycleTransitioning.value = true
     lifecycleError.value = null
     try {
       currentPoll.value = await apiPost<OwnedPoll>(`/polls/${pollId}/reopen`)
       if (currentPoll.value) await loadResults(currentPoll.value.publicToken)
     } catch (err) {
       lifecycleError.value = lifecycleMessageFor(err)
       throw err
     } finally {
       lifecycleTransitioning.value = false
     }
   }
   ```
   Note `apiPost` is called with only the path (no body) for these — confirm `post`'s signature treats a missing body as an empty/no-body POST (the existing `complete()` passes a body, so verify `post(path)` is valid; if `post` requires a second arg, pass `undefined` or `{}`).

9. **`pollStore.ts` — add the new refs + actions to the returned bag.** The returned object (lines 189–208) MUST list every ref/action or the view cannot reach it. Add, alongside the existing entries:
   ```ts
   updating,
   updateError,
   update,
   removing,
   removeError,
   remove,
   lifecycleTransitioning,
   lifecycleError,
   cancel,
   reopen,
   ```

10. **`pollStore.ts` — add the action-specific error mappers.** The existing `messageFor` (lines 212–223) and `completeMessageFor` (lines 226–233) branch on `ApiError.status` and extract `body.message` (class-validator arrays → take `[0]`). Add three new mappers at the end of the file (after `completeMessageFor`), each preferring the server's own `message` then falling back to a code-specific sentence:
    ```ts
    /** Map an `update()` failure to a single user-facing sentence. */
    function updateMessageFor(err: unknown): string {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | null
        const message = body?.message
        if (Array.isArray(message)) return message[0] ?? 'Please check the form and try again.'
        if (typeof message === 'string' && message !== '') return message
        if (err.status === 409) return 'This poll can no longer be edited.'
        return 'Could not save your changes. Please try again.'
      }
      return 'Could not reach the server — try again.'
    }

    /** Map a `remove()` failure to a single user-facing sentence. */
    function removeMessageFor(err: unknown): string {
      if (err instanceof ApiError) {
        if (err.status === 404) return 'This poll no longer exists.'
        return 'Could not delete the poll. Please try again.'
      }
      return 'Could not reach the server — try again.'
    }

    /** Map a `cancel()`/`reopen()` failure to a single user-facing sentence. */
    function lifecycleMessageFor(err: unknown): string {
      if (err instanceof ApiError) {
        if (err.status === 409) return 'This poll is not in a state that allows that change.'
        return 'Could not change the poll status. Please try again.'
      }
      return 'Could not reach the server — try again.'
    }
    ```

11. **Tests — `frontend/src/stores/__tests__/pollStore.spec.ts`.** Extend the `vi.hoisted()` mock (currently lines 7–14, mocking only `get`/`post`) to also mock `patch`/`del`, and add coverage for every new action. Steps:
    - Extend the hoisted block:
      ```ts
      const { get, post, patch, del } = vi.hoisted(() => ({
        get: vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(),
        post: vi.fn<(path: string, body?: unknown, init?: RequestInit) => Promise<unknown>>(),
        patch: vi.fn<(path: string, body?: unknown, init?: RequestInit) => Promise<unknown>>(),
        del: vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(),
      }))
      ```
    - Extend the `vi.mock('@/lib/api/client', ...)` return to spread + override all four: `return { ...actual, get, post, patch, del }`. (Keep the spread so the real `ApiError` class is preserved.)
    - Add `describe('pollStore.update', ...)`:
      - success: `patch.mockResolvedValueOnce({ id: '42', publicToken: 'tok', status: 'open', dates: [] })`; `get.mockResolvedValueOnce({ best: null, slots: [] })`; call `await store.update('42', { title: 'New' })`; assert `patch` called with `'/polls/42'` + the payload, `currentPoll?.title === 'New'`, `get` called with `'/public/polls/tok/results'`, `updateError` null, `updating` false.
      - 409: `patch.mockRejectedValueOnce(new ApiError(409, { message: 'not open' }))`; assert `store.update(...)` rejects `instanceof ApiError`, `updateError === 'not open'` (server message preferred), `updating` false.
      - 400 array: `patch.mockRejectedValueOnce(new ApiError(400, { message: ['title too long', 'x'] }))`; assert `updateError === 'title too long'`.
      - invalidate via marker: `await store.update('42', { dates: [{ id: '3', eventDate: '2026-07-01', invalidatedAt: '2026-06-19T00:00:00.000Z', slots: [] }] })`; assert `patch` received the marker in the body (this is how invalidation is expressed — there is no separate action).
    - Add `describe('pollStore.remove', ...)`:
      - success: seed `store.polls = [{ id: '42', ... }, { id: '7', ... }]` (cast as needed) and `store.currentPoll`/`results`/`invite` non-null; `del.mockResolvedValueOnce(undefined)`; call `await store.remove('42')`; assert `del` called with `'/polls/42'`, the `'42'` row gone from `polls`, `currentPoll`/`results`/`invite` all null, `removeError` null.
      - failure: `del.mockRejectedValueOnce(new ApiError(404, null))`; assert reject + `removeError === 'This poll no longer exists.'`.
    - Add `describe('pollStore.cancel / reopen', ...)`:
      - cancel success: `post.mockResolvedValueOnce({ id: '42', publicToken: 'tok', status: 'cancelled', dates: [] })`; `get.mockResolvedValueOnce({ best: null, slots: [] })`; `await store.cancel('42')`; assert `post` called with `'/polls/42/cancel'`, `currentPoll?.status === 'cancelled'`, `lifecycleTransitioning` false.
      - reopen success: `post.mockResolvedValueOnce({ id: '42', publicToken: 'tok', status: 'open', finalSlotId: null, completedAt: null, dates: [] })`; `await store.reopen('42')`; assert path `'/polls/42/reopen'`, `currentPoll?.status === 'open'`, `currentPoll?.finalSlotId === null`.
      - 409: `post.mockRejectedValueOnce(new ApiError(409, null))`; assert reject + `lifecycleError === 'This poll is not in a state that allows that change.'`.
    - Keep `beforeEach` clearing all mocks (already present, line 21 `vi.clearAllMocks()`).

12. **Optional sanity:** the public/participant store (`frontend/src/stores/publicPollStore.ts`) and `public-poll.ts` do NOT change in this phase — the participant-facing exclusion of invalidated slots is the backend's responsibility (Phase 3), and those files only consume `PublicPoll`, which now carries the new optional fields transitively but never filters on them client-side. Confirm `npm run type-check` still passes them clean.

## Verification
Run inside `frontend/`:
- `npm run type-check` — vue-tsc must pass clean (new wire fields + input types are additive; the store actions are fully typed).
- `npm run lint` — oxlint + eslint (`--fix`); no new warnings.
- `npm run test:unit -- pollStore` — the extended `pollStore.spec.ts` (all existing + new `update`/`remove`/`cancel`/`reopen` describe blocks) must be green.
- `npm run test:unit` — full unit suite stays green (no regression in `client.spec.ts` or other stores).
- Optional manual (only if Phase 2 backend is running locally): from the browser console, `usePollStore().cancel('<id>')` then `.reopen('<id>')` against a real open poll and confirm `currentPoll.status` round-trips `open → cancelled → open`.

## Acceptance
- [x] `PollSlot` and `PollDate` in `frontend/src/lib/api/types.ts` each carry `invalidatedAt: string | null`, and `PollSlot` carries the optional per-slot vote count matching Phase 2's `GET /api/polls/:id` shape.
- [x] `frontend/src/types/poll.ts` exports `UpdatePollPayload` + `UpdatePollDateInput`/`UpdatePollSlotInput`, whose nested rows carry optional `id` and `invalidatedAt`.
- [x] `pollStore` exposes `update`, `remove`, `cancel`, `reopen` (and their `updating`/`updateError`, `removing`/`removeError`, `lifecycleTransitioning`/`lifecycleError` refs) from its returned bag, each calling the correct verb/path (`PATCH /polls/:id`, `DELETE /polls/:id`, `POST /polls/:id/cancel`, `POST /polls/:id/reopen`). There are NO separate `invalidate`/`reactivate` actions — invalidation is expressed via `update()`'s `dates` markers.
- [x] `update`/`cancel`/`reopen` swap `currentPoll` with the returned poll and refresh `results`; `remove` clears the detail slice and drops the row from `polls`.
- [x] Each action records a readable, action-specific error message on failure and rethrows; mappers prefer the server's `message`.
- [x] `pollStore.spec.ts` mocks `patch`/`del` and covers each action's success + at least one documented error code; `npm run test:unit -- pollStore` is green.
- [x] `npm run type-check` and `npm run lint` pass.
