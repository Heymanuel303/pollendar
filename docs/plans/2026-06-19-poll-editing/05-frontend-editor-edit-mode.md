# Phase 5: Frontend editor edit-mode (reuse PollEditor for `/polls/:id/edit`)

**Plan:** [poll-editing](00-overview.md)
**Depends on:** [04-frontend-store-and-types.md](04-frontend-store-and-types.md)
**Execution:** solo
**Status:** completed

## Context
A poll creator must be able to edit a live poll without destroying participant votes: add new dates/slots, soft-invalidate (deactivate) existing ones while keeping their historical votes, edit scalar fields, and cancel/reopen the poll. Phases 1–3 added the soft-invalidation column + vote-preserving diff update on the backend; phase 4 extended the frontend wire types (`PollSlot`/`PollDate` now carry `invalidatedAt`, and `PollSlot` carries a per-slot vote count) and added `pollStore.update()` + the `UpdatePollPayload`/`UpdatePollDateInput`/`UpdatePollSlotInput` types. This phase wires the existing create-only `PollEditor.vue` into a dual-mode editor: a new `/polls/:id/edit` route loads an owned poll into the same form, locks voted dates/slots from in-place edits, surfaces invalidate/reactivate controls, allows brand-new dates/slots, and submits via `pollStore.update()` (PATCH) instead of `create()` (POST).

## Objective
Add a `/polls/:id/edit` route that reuses `PollEditor.vue` in edit mode — pre-populating the form from `pollStore.get(id)`, preserving slot/date `id`s across the edit cycle, locking voted entries to invalidate-only, and PATCHing the full vote-preserving payload through `pollStore.update()`.

## Files to touch
- `frontend/src/types/poll.ts` — extend `PollSlotInput`/`PollDateInput` with edit-mode form-tracking fields (`id?`, `invalidatedAt?`, `hasVotes?`); IMPORT `UpdatePollPayload`/`UpdatePollDateInput`/`UpdatePollSlotInput` (already exported here by Phase 4) — do NOT redefine them.
- `frontend/src/router/index.ts` — add the `/polls/:id/edit` route (`name: 'poll-edit'`, `requiresAuth`) pointing at `PollEditor.vue`, before/after the existing `/polls/:id` (`poll-manage`) route (more-specific path; order is fine either way since `/edit` is a distinct segment).
- `frontend/src/views/PollEditor.vue` — detect mode from the route, load the poll in edit mode, fork `buildPayload()`, swap `create()` for `update()`, and pass an `editMode`/lock-aware contract down to the editors.
- `frontend/src/components/DateSlotEditor.vue` — thread an `editMode` flag through; render locked dates read-only with an Invalidate/Reactivate control; keep "+ Add date" available.
- `frontend/src/components/CalendarDateEditor.vue` — same `editMode` threading; locked (voted) selected days are not toggleable-off, but new days can still be added.
- `frontend/src/components/DateCard.vue` — accept `editMode`; when the date is locked, suppress its remove ✕ and slot add/remove, surface an Invalidate/Reactivate toggle, render slots read-only.
- `frontend/src/components/SlotRow.vue` — accept a `locked` prop; when locked, render label/time/all-day read-only (no inputs, no remove) but still expose a per-slot Invalidate/Reactivate control.
- `frontend/src/components/PollSlotRow.vue` — no behavioural change needed (participant read-only view); review only to confirm slot `id` continuity is preserved through the edit cycle (no change expected — leave as-is unless a type import breaks).
- `frontend/src/views/PollManage.vue` — add an "Edit poll" entry point (RouterLink to `/polls/:id/edit`) in the manage header so the route is reachable.
- `frontend/src/stores/pollStore.ts` — verify the phase-04 `update(id, payload)` action + `updating`/`updateError` state exist and are exported; this phase consumes them (do not redefine if already present).
- `frontend/src/views/__tests__/PollEditor.spec.ts` — add an edit-mode describe block (load, lock, invalidate/reactivate, add-new, PATCH submit). Co-located, this phase.
- `frontend/src/components/__tests__/SlotRow.spec.ts` and `frontend/src/components/__tests__/DateCard.spec.ts` — add (or extend) locked/read-only + invalidate-control unit tests, co-located, this phase.

## Steps

1. **Confirm phase-04 surface before touching this layer.** Read `frontend/src/stores/pollStore.ts` and `frontend/src/lib/api/types.ts`. The dependency phase 04 must have added:
   - `PollSlot.invalidatedAt: string | null` and `PollDate.invalidatedAt: string | null` (wire types in `api/types.ts`).
   - The per-slot vote count on the creator detail read — `PollSlot.responseCount` (or `_count.responses`), added by Phase 4 to mirror Phase 2's enriched `GET /api/polls/:id`. This is the source for the voted-slot lock.
   - `pollStore.update(id: string, payload: UpdatePollPayload): Promise<void>` (swaps `currentPoll`, refreshes results) plus `updating` (boolean ref) and `updateError` (string|null ref), exported from the store's return object and mirroring the `complete()` loading/error pattern.
   - The `UpdatePollPayload`/`UpdatePollDateInput`/`UpdatePollSlotInput` types (the PATCH body: optional `title`, `description: string | null`, `timezone`, `closesAt: string | null`, and `dates` carrying per-date/per-slot `id` + `invalidatedAt`), exported from `@/types/poll` by Phase 4 and matching backend `UpdatePollDto`.
   If any of these are missing, STOP and finish phase 04 first — this phase cannot pass otherwise. (If phase 04 named the action/type differently, use its real names throughout and adjust the references below.)

2. **Extend the editor input types** in `frontend/src/types/poll.ts`.
   - On `PollSlotInput` (lines 18–24) add three optional fields used only in edit mode:
     ```ts
     id?: string            // present ⇒ existing row (loaded from the API); absent ⇒ brand-new slot
     invalidatedAt?: string | null  // soft-invalidation marker; null/absent ⇒ active
     hasVotes?: boolean     // derived at load time; true ⇒ immutable in place (invalidate-only)
     ```
   - On `PollDateInput` (lines 27–31) add the same three optional fields (`id?`, `invalidatedAt?`, `hasVotes?`). A date is locked when it has an `id` AND at least one of its slots `hasVotes` (a voted date is immutable in place; invalidating the date logically invalidates its slots).
   - Do NOT redefine the PATCH payload types here — `UpdatePollPayload`, `UpdatePollDateInput`, and `UpdatePollSlotInput` are already exported from this same file by Phase 4 (nested rows carry optional `id` + `invalidatedAt`). Reference/import them; `buildPayload()` (Step 5) maps the form's `PollDateInput[]` into `UpdatePollDateInput[]` (carrying `id`/`invalidatedAt`, dropping the form-only `hasVotes`).
   - Keep `CreatePollPayload` unchanged — it must NEVER carry `id`/`invalidatedAt`/`hasVotes` (those are edit-only). Update the file's doc comment to note the new form-only tracking fields are stripped from the create payload by `buildPayload()`.

3. **Add the edit route** in `frontend/src/router/index.ts`. After the `poll-new` block (lines 23–28) and alongside `poll-manage` (lines 29–34), add:
   ```ts
   {
     path: '/polls/:id/edit',
     name: 'poll-edit',
     component: () => import('@/views/PollEditor.vue'),
     meta: { requiresAuth: true },
   },
   ```
   Both `poll-new` and `poll-edit` resolve to `PollEditor.vue`; the component branches on the route. `/polls/:id/edit` is a distinct path segment from `/polls/:id`, so there is no ambiguity with `poll-manage`.

4. **Add mode detection + loading to `PollEditor.vue`** (`frontend/src/views/PollEditor.vue`).
   - Import `useRoute`, `onMounted`, `storeToRefs`. Add `const route = useRoute()`.
   - Derive the edit id and mode:
     ```ts
     const editId = computed<string | null>(() => {
       const id = route.params.id
       return typeof id === 'string' && id !== '' ? id : null
     })
     const isEdit = computed<boolean>(() => editId.value !== null)
     ```
     (Absence of `route.params.id` = CREATE; presence = EDIT. Equivalent to checking `route.name === 'poll-edit'`.)
   - In `onMounted`, when `isEdit.value`, call `await pollStore.get(editId.value!)` and then hydrate the form refs from `pollStore.currentPoll`:
     - `title.value`, `description.value`, `timezone.value` from the loaded poll.
     - `closesAtLocal.value` from `currentPoll.closesAt` converted to a `datetime-local` wall-clock string in `currentPoll.timezone` (reuse the timezone helpers in `@/lib/utils/timezone`; if no ISO→local helper exists, add a small local converter — do NOT hand-roll TZ math elsewhere).
     - `dates.value` mapped from `currentPoll.dates[]` into `PollDateInput[]`, preserving `id`, `eventDate`, `invalidatedAt`, each slot's `id`/`startTime`/`endTime`/`isAllDay`/`label`/`invalidatedAt`. Times come off the wire as ISO instants anchored to `1970-01-01` (see `api/types.ts` lines 21–25); convert each `startTime`/`endTime` to the `"HH:mm"` form the time `<input>`s expect (reuse `formatTime`/an existing wall-clock helper in `@/lib/utils/timezone`).
   - Compute the per-slot/per-date vote-lock at load time and stamp `hasVotes` onto the mapped inputs. Phase 2 enriched `GET /polls/:id` so each `PollSlot` carries a per-slot vote count (`responseCount` / `_count.responses`; Phase 4 added the field to the `PollSlot` wire type). Map it straight into `slot.hasVotes = (slot.responseCount ?? slot._count?.responses ?? 0) > 0` (use the exact field name Phase 4 shipped), and derive `date.hasVotes = date.slots.some((s) => s.hasVotes)`. Add a code comment naming the source field. No fallback participant-responses fetch is needed — the count is on the detail read.
   - Add `const loaded = ref(false)` (or reuse `pollStore.detailLoading`) so the template can show a "Loading poll…" state in edit mode before hydration, and a "Poll not found" empty state when `pollStore.detailError` is set (mirror `PollManage.vue` lines 118–135).

5. **Fork `buildPayload()`** in `PollEditor.vue` (currently lines 88–103, CREATE-only).
   - Keep the existing CREATE branch verbatim for the create path (it must keep emitting `{ title, description?, timezone, dates: [...] }` with NO ids, NO `invalidatedAt`, NO `closesAt`).
   - Add an EDIT branch building an `UpdatePollPayload`:
     - Scalars: `title` (trimmed), `description` (trimmed → `''` becomes `null` to clear, not `undefined`), `timezone`, and `closesAt` — convert `closesAtLocal` (`datetime-local` wall-clock) back to an ISO instant in `timezone.value`; `closesAtLocal === ''` ⇒ `null` (clear it). This is the change called out by the TODO at lines 110–111 (closesAt is PATCH-only).
     - `dates`: map the ENTIRE `dates.value` array (full-replace strategy — the backend diff-update reconciles by `id`, but the request still sends the whole set; never a delta — see `UpdatePollDto` doc lines 13–19). For each date emit `{ id?, eventDate, invalidatedAt?, slots: [...] }`; for each slot emit `{ id?, label?, isAllDay/startTime/endTime, invalidatedAt? }`. Convert `"HH:mm"` form-values back to whatever the backend `CreatePollSlotDto.startTime`/`endTime` expects (`"HH:mm"`/`"HH:mm:ss"` per `create-poll.dto.ts` line 16–19).
     - Do NOT set `sortOrder` on existing dates/slots — the backend auto-assigns/preserves it (gotcha: `PollDate.sortOrder`/`PollSlot.sortOrder` are server-owned).
     - Include `id` ONLY when present (existing rows); omit it for brand-new dates/slots so the backend creates them.
     - Include `invalidatedAt` for every existing entry so reactivations (null) and invalidations (timestamp) round-trip; new entries omit it (active by default).
   - Have `submit()` (lines 105–116) branch on `isEdit.value`: EDIT → `const updated = await pollStore.update(editId.value!, buildEditPayload())`, then re-hydrate the form from `updated` (so newly-assigned `id`s land on the inputs and the next save is diff-correct) and `router.push('/polls/' + editId.value)` back to manage. CREATE → unchanged (`pollStore.create()` then push to `/polls/:id`). The post-create closesAt TODO is now satisfied by the EDIT branch and should be removed.

6. **Validation rules in edit mode** (`isValid()`, lines 78–86, and the per-slot rule).
   - An invalidated date/slot is EXCLUDED from validation (a deactivated entry needn't have valid times). Validate only active (`invalidatedAt == null`) dates/slots.
   - At least one ACTIVE date with at least one ACTIVE slot must remain (cannot save a poll where everything is invalidated). Surface a clear inline error when the creator invalidates the last active entry.
   - Locked (voted) ACTIVE slots are immutable but already have valid persisted times, so they always pass; only editable (zero-vote) active slots are checked for `isAllDay || (startTime && endTime)`.
   - Keep the create-mode rule unchanged (every date has ≥1 slot; each slot all-day or has both times).

7. **Thread `editMode` + lock state through the editors.** In `PollEditor.vue` template, pass `:edit-mode="isEdit"` to both `<CalendarDateEditor>` and `<DateSlotEditor>` (lines 209–215). Each editor forwards it down. The persisted Calendar|List preference is intentionally shared across `/polls/new` and `/polls/:id/edit` (it will NOT reset on navigation — document this in a comment near `editorView`, lines 39–45).

8. **`DateSlotEditor.vue`** (`frontend/src/components/DateSlotEditor.vue`): add `editMode?: boolean` to `defineProps` (lines 13–17) and pass it to each `<DateCard>` (lines 67–75) as `:edit-mode="editMode"`. Keep `addDate()` (lines 41–48) unconditional — adding brand-new dates is always allowed, even in edit mode. New dates created here carry no `id` (correct — the backend will insert them).

9. **`DateCard.vue`** (`frontend/src/components/DateCard.vue`): add `editMode?: boolean` to props (lines 13–17). Derive:
   - `isLocked = computed(() => editMode && modelValue.id != null && (modelValue.hasVotes || modelValue.slots.some(s => s.hasVotes)))` — a loaded date with votes.
   - `isInvalidated = computed(() => modelValue.invalidatedAt != null)`.
   When `isLocked` (or `isInvalidated`):
   - Hide the per-slot add button and the date remove ✕ (lines 61–68, 85–91); voted dates can only be invalidated, never removed in place.
   - Render an "Invalidate date" / "Reactivate date" toggle that emits an immutable update of the date with `invalidatedAt` set to a new ISO timestamp (`new Date().toISOString()`) or `null`. When invalidating a date, ALSO stamp `invalidatedAt` on each of its slots (decision: invalidating a date logically invalidates its slots); reactivating clears the date's `invalidatedAt` (slots stay as their own state, but at minimum un-invalidate the date — keep slot-level invalidation independent unless it was set by the date toggle; simplest correct behaviour: reactivating a date also clears slot-level `invalidatedAt` that the date toggle set — track via a clear, commented rule).
   - Pass `:locked="isLocked || isInvalidated"` (per-slot) to each `<SlotRow>` so voted/invalid slots render read-only.
   - Apply a muted/strikethrough visual treatment when `isInvalidated` (dim text, "Invalidated" pill) so the creator sees it is deactivated but history-preserved.
   For zero-vote loaded dates and brand-new dates, keep the existing freely-editable behaviour (add/remove/update slots, edit eventDate). All mutations stay immutable (`{ ...props.modelValue, ... }`, lines 26–42) — never mutate in place.

10. **`SlotRow.vue`** (`frontend/src/components/SlotRow.vue`): add `locked?: boolean` to props (line 11). When `locked`:
    - Render label / all-day / time range as READ-ONLY text (reuse the same wall-clock formatting; show "All day" or `HH:mm–HH:mm`) instead of the `<input>`s (lines 69–119).
    - Hide the remove ✕ (lines 121–128).
    - Still render a per-slot "Invalidate" / "Reactivate" control that emits `patch({ invalidatedAt: locked-now ? null : new Date().toISOString() })` (reuses the existing immutable `patch()` at lines 15–17). When `invalidatedAt != null`, dim the row + show an "Invalidated" badge.
    - A locked slot does NOT run the incomplete-times validation visual (it always has valid persisted times); keep `showError` false for locked slots.
    For unlocked (zero-vote / new) slots, behaviour is unchanged.

11. **`CalendarDateEditor.vue`** (`frontend/src/components/CalendarDateEditor.vue`): add `editMode?: boolean` to props (lines 18–22). In edit mode:
    - In `toggleDate()` (lines 92–104), a tap on a LOCKED (voted) day must NOT remove it (guard: if the matching `modelValue` entry has `id` + `hasVotes`, do nothing or route through invalidate instead). Tapping an unlocked existing day or a new day works as today.
    - Keep "Apply to N selected" (`applyToSelected`, lines 107–116) from stamping new slot presets onto LOCKED dates — skip voted dates so their persisted voted slots are never silently overwritten (only apply to zero-vote / new dates).
    - New days added in the calendar carry no `id` (correct — backend inserts them).
    Because the Calendar editor has no per-date controls, the richest invalidate/reactivate UX lives in the List editor (`DateCard`/`SlotRow`); the Calendar editor's edit-mode job is only to NOT destroy voted data. Document this asymmetry in a comment.

12. **Reachable entry point in `PollManage.vue`** (`frontend/src/views/PollManage.vue`): add an "Edit poll" `RouterLink` (to `{ name: 'poll-edit', params: { id } }` or `/polls/${id}/edit`) in the header block (near lines 139–162). Show it for `open` (and `cancelled`, since reopen/edit applies) polls; for `completed` polls, the edit view's reopen control (handled by the lifecycle phase) is the path back to open — still allow navigating to edit. Keep the existing manage layout intact.

13. **Tests — `frontend/src/views/__tests__/PollEditor.spec.ts`** (extend the existing file; keep current describes green). Add a `describe('PollEditor — edit mode', ...)` block. Update the `vue-router` mock at the top (lines 5–7) so `useRoute` is mockable per-test (return `{ params: { id: 'EDIT_ID' } }` for edit tests, `{ params: {} }` for create tests) alongside the existing `useRouter` stub. Mock `pollStore` methods (`get`, `update`) via the real Pinia store with spies (the file already uses `createPinia()` at line 61). Assert:
    - Mounting on the edit route calls `pollStore.get('EDIT_ID')` and pre-populates `title`/`description`/`timezone`/`dates` from a fixture `OwnedPoll` (with one voted slot carrying `id` + `hasVotes`/response indicator and one zero-vote slot).
    - The voted slot renders read-only (no time `<input>`s, no remove ✕) and exposes an Invalidate control; the zero-vote slot stays editable.
    - Clicking "Invalidate" on the voted slot updates its `invalidatedAt`; clicking the date Invalidate stamps `invalidatedAt` on the date + its slots.
    - Adding a brand-new date/slot works in edit mode (it has no `id`).
    - Submitting calls `pollStore.update('EDIT_ID', payload)` (NOT `create()`); the payload includes existing `id`s, `invalidatedAt` round-trips, `closesAt` is present (ISO or null), and brand-new entries omit `id`. Assert the heading reads "Edit poll" (not "Create a poll") and the action button reads "Save changes" (not "Create poll") in edit mode.
    - A poll where the creator invalidates the last active slot/date fails validation with a visible inline error and does NOT call `update()`.

14. **Tests — `frontend/src/components/__tests__/SlotRow.spec.ts`** (new file) and `DateCard.spec.ts` (new file). Cover, at the unit level:
    - `SlotRow` with `locked` renders read-only times + an Invalidate/Reactivate control, hides the remove ✕, and emits `update:modelValue` with toggled `invalidatedAt` on click; without `locked` it behaves exactly as today (inputs present, remove emits).
    - `DateCard` with `editMode` + a voted date hides add-slot/remove-date, exposes Invalidate-date, and on invalidate emits a date whose `invalidatedAt` is set AND every slot's `invalidatedAt` is set; a zero-vote date in edit mode keeps full editability.

15. **Template copy in `PollEditor.vue`**: make the breadcrumb + heading + submit button mode-aware (lines 122–128, 290 and the bottom-sheet duplicate at line 384). Edit mode: breadcrumb "Polls / Edit", heading "Edit poll", button "Save changes" / "Saving…" bound to `pollStore.updating`, and the error line bound to `pollStore.updateError` (lines 286–294 and 379–388). Create mode keeps the existing "Create a poll" / "Create poll" copy and `pollStore.creating`/`error`. Keep the preview sidebar/bottom-sheet structure; the preview shows locked + new slots side-by-side with no special treatment (gotcha: lock-state is form-only).

## Verification
- `cd frontend && npm run type-check` — `vue-tsc --build` passes (new `id`/`invalidatedAt`/`hasVotes` fields and `UpdatePollPayload` type-check; `pollStore.update()` signature matches).
- `cd frontend && npm run lint` — oxlint + eslint clean (no in-place mutation, no unused props).
- `cd frontend && npm run format` — prettier clean.
- `cd frontend && npm run test:unit -- PollEditor SlotRow DateCard` — the extended `PollEditor.spec.ts` plus the new `SlotRow.spec.ts` / `DateCard.spec.ts` pass, and the pre-existing PollEditor describes stay green.
- `cd frontend && npm run build` — production build succeeds.
- Manual UI check (dev server + a live poll with at least one vote): navigate `/polls/:id/edit`, confirm the voted slot is read-only with an Invalidate control while a zero-vote slot is editable; invalidate a slot, add a new date+slot, edit the title, and Save; confirm the manage view (`/polls/:id`) reflects the change, the invalidated slot is gone from the public voting view (`/p/:token`), and the historical vote is preserved (results still count it in history but exclude it from the live tally per the backend phases).

## Acceptance
- [x] `/polls/:id/edit` loads an existing owned poll into `PollEditor.vue` with title/description/timezone/closesAt/dates pre-populated and slot/date `id`s preserved.
- [x] Voted dates/slots render read-only (no in-place time/label/eventDate edits, no remove) and expose Invalidate/Reactivate; zero-vote and brand-new entries stay freely editable.
- [x] Invalidating a date stamps `invalidatedAt` on the date and all its slots; reactivating clears it; the change round-trips through the PATCH payload.
- [x] Submitting in edit mode calls `pollStore.update(id, payload)` (PATCH) — never `create()` — with existing `id`s, `invalidatedAt` markers, and `closesAt`; brand-new entries omit `id`. Create mode is unchanged (POST, no ids).
- [x] Saving a poll where every date/slot is invalidated is blocked with a visible inline error; at least one active date with one active slot is required.
- [x] `npm run type-check`, `npm run lint`, and the scoped `npm run test:unit -- PollEditor SlotRow DateCard` all pass; the pre-existing PollEditor toggle/bottom-sheet tests remain green.
