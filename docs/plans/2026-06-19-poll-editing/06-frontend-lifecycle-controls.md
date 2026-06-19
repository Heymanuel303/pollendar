# Phase 6: Frontend lifecycle controls (manage actions + closed/cancelled display)

**Plan:** [poll-editing](00-overview.md)
**Depends on:** [04-frontend-store-and-types.md](04-frontend-store-and-types.md)
**Execution:** solo

## Context
The feature lets a poll creator edit a live poll without destroying votes: add/soft-invalidate dates and slots, edit scalar fields, and run a cancel/reopen lifecycle (`open<->cancelled`, `open<->completed`). Backend phases already filter invalidated slots out of the public view, results, tally cache, and submission path, and the wire `status` is `'open' | 'completed' | 'cancelled'`. Phase 04 added the store actions this phase consumes (`cancel`, `reopen`, `remove`/`deletePoll`) plus the `/polls/:id/edit` route landed in phase 05. This phase is the last UI surface: expose the lifecycle controls and accurate states in the creator manage view and reflect the cancelled state for participants.

## Objective
Add an Edit link plus Cancel / Reopen / Delete actions with accurate status pills to `PollManage.vue`, and ensure the participant `PublicPoll.vue` renders a correct closed/cancelled display state (voting disabled, results still viewable).

## Files to touch
- `frontend/src/views/PollManage.vue` — add Edit link, status pills for all three states, and Cancel / Reopen / Delete actions each behind a confirm dialog; own the dialog + error state and call store actions.
- `frontend/src/views/PublicPoll.vue` — confirm the cancelled/completed closed state renders correctly via the existing `isOpen` gate; refine the closed banner copy so it is accurate for both completed and cancelled.
- `frontend/src/stores/pollStore.ts` — VERIFY only: confirm phase 04 exposed `cancel(id)`, `reopen(id)`, and a delete action (`remove(id)` / `deletePoll(id)`) plus their loading/error refs. Do NOT add backend calls here if phase 04 already did; only add the thin error/loading refs + actions if (and only if) phase 04 left them out. Cite what you found.
- `frontend/src/views/__tests__/PollManage.spec.ts` — NEW. Co-located tests for the new pills, Edit link target, and the three confirm-dialog flows.
- `frontend/src/views/__tests__/PublicPoll.spec.ts` — NEW (or extend if present). Tests that a cancelled poll disables voting and still shows results.

## Steps

1. **Confirm the store contract from phase 04 (read-only — phase 04 owns these, do NOT re-add).** Open `frontend/src/stores/pollStore.ts` and confirm the lifecycle actions + state phase 04 shipped, alongside the existing `complete()`:
   - `cancel(pollId: string): Promise<void>` → `POST /api/polls/:id/cancel` (no body); assigns the returned `OwnedPoll` to `currentPoll`, refreshes results, sets a readable error on failure and rethrows.
   - `reopen(pollId: string): Promise<void>` → `POST /api/polls/:id/reopen` (no body); the backend clears `finalSlotId` + `completedAt` when reopening a completed poll. Assigns the returned poll to `currentPoll` and refreshes results.
   - `remove(pollId: string): Promise<void>` → `DELETE /api/polls/:id` (`polls.controller.ts` line 92 `@Delete(':id')`), then clears `currentPoll`/`results`/`invite` and drops the row from the cached `polls` list.
   - State refs (phase 04's ACTUAL names): `cancel`/`reopen` SHARE `lifecycleTransitioning` (boolean) + `lifecycleError` (string|null); `remove` uses `removing` + `removeError`. (Only one lifecycle dialog is open at a time, so a shared cancel/reopen pair is fine.)
   - These are GUARANTEED present by phase 04 (this phase depends on it). If any are missing, STOP and finish phase 04 — do not re-implement store actions here. Note: invalidation has NO store action and NO manage-view control — it is expressed through `update()`'s `dates` markers in the editor (phases 04/05), not here.

2. **PollManage.vue — extend the store binding.** In the `storeToRefs(store)` destructure (lines 26-27) add `lifecycleTransitioning, lifecycleError, removing, removeError`. Keep `completing`/`completeError` as-is.

3. **PollManage.vue — replace the binary status pill with a three-state pill.** The header currently renders (lines 144-145):
   ```
   <Pill v-if="isCompleted" tone="mint">Completed</Pill>
   <Pill v-else tone="pollen">Open · gathering responses</Pill>
   ```
   Add a `status` computed shortcut and a cancelled case. `Pill.vue` only supports `'pollen' | 'mint' | 'coral' | 'neutral'` (no cancelled tone) — use `tone="neutral"` for cancelled to match `PollCard.vue` line 39 (`bg-surface2 text-mute ring-line`). Render exactly one pill:
   - `status === 'completed'` → `<Pill tone="mint">Completed</Pill>`
   - `status === 'cancelled'` → `<Pill tone="neutral">Cancelled</Pill>`
   - else (`open`) → `<Pill tone="pollen">Open · gathering responses</Pill>`
   Add a computed `isCancelled = computed(() => currentPoll.value?.status === 'cancelled')` next to `isCompleted` (line 84) and keep `isCompleted`.

4. **PollManage.vue — add an Edit link in the header.** Add a `RouterLink` to `/polls/:id/edit` (route added by phase 05 — VERIFY it exists in `frontend/src/router/index.ts`; if absent, STOP and flag, do not invent it). Place it in the header `<div class="flex flex-wrap items-center gap-3">` (line 140) after the title/pill, styled like the existing secondary affordances (mirror the EmptyState CTA classes at lines 130-132: `inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 font-medium text-moonlight transition hover:bg-surface2`, but `text-sm`). Use `:to="`/polls/${id.value}/edit`"` via the existing `id` computed (line 29). Only render the Edit link when `status !== 'cancelled'` (a cancelled poll is not editable in place; reopen first) — render it for `open` and `completed`.

5. **PollManage.vue — add a creator actions row.** Below the header (`</header>` at line 162) and above the `<BestSlotBloom>` (line 165), add a `<div class="mb-6 flex flex-wrap items-center gap-2">` containing the lifecycle buttons, using `Button.vue` variants:
   - When `status === 'open'`: a `<Button variant="danger" @click="openCancelConfirm">Cancel poll</Button>` (cancel = stop accepting votes, reversible).
   - When `status === 'cancelled'` OR `status === 'completed'`: a `<Button variant="secondary" @click="openReopenConfirm">Reopen poll</Button>` (reopen returns to `open`; for completed it also clears the final slot).
   - Always: a `<Button variant="ghost" @click="openDeleteConfirm">Delete poll</Button>` (destructive permanent delete — distinct from cancel).
   Keep the row visible in all non-loading/non-error states (inside the `<template v-else>` block, lines 137-219).

6. **PollManage.vue — wire BestSlotBloom for cancelled.** `BestSlotBloom.vue` shows the Complete CTA only when `status === 'open'` (line 80) and otherwise falls to the "✓ Completed" else branch (lines 96-101). A cancelled poll will hit that else branch and incorrectly read "✓ Completed". Pass an additional signal so the bloom can distinguish cancelled from completed: either (a) gate the BestSlotBloom render in PollManage with `v-if="status !== 'cancelled'"` and render a plain neutral "This poll is cancelled — reopen it to keep gathering responses." card in its place, OR (b) preferred: leave BestSlotBloom mounted but, when cancelled, do not rely on its completed copy — instead render a sibling neutral status note. Choose (a) for the smallest blast radius (do NOT edit `BestSlotBloom.vue`; it is out of scope for this phase). Implement: wrap the existing `<BestSlotBloom .../>` (lines 165-176) in `<template v-if="!isCancelled">`, and add an `<template v-else>` rendering a `rounded-2xl border border-line bg-surface p-6 text-dim shadow-card mb-8` card with copy "This poll is cancelled. Reopen it to keep gathering responses." This keeps `BestSlotBloom.vue` untouched.

7. **PollManage.vue — add three confirm dialogs + their state.** Mirror the existing complete-confirm dialog (lines 222-247) and its state (`confirmOpen` ref line 87, `openConfirm` lines 88-91 that clears the error then opens, `confirmComplete` lines 92-100 that keeps the dialog open on error). For EACH of cancel / reopen / delete add:
   - A `ref(false)` open flag: `cancelConfirmOpen`, `reopenConfirmOpen`, `deleteConfirmOpen`.
   - An `openX()` function that FIRST clears the relevant error ref (`lifecycleError.value = null` for cancel/reopen, `removeError.value = null` for delete — the gotcha: a stale error must not flash; the complete dialog does this at line 89) then sets the open flag true.
   - A `confirmX()` async function that guards `if (!currentPoll.value) return`, `try`s the store action, closes the dialog on success, and in `catch` leaves the dialog open (the store already set the error ref). For delete, on success also `await router.push('/dashboard')` (import `useRouter` — PublicPoll.vue line 3 shows the pattern; PollManage does not currently import it, add `import { useRouter } from 'vue-router'` to line 3's import group and `const router = useRouter()`).
   - A dialog DOM block copying the structure at lines 222-247: `fixed inset-0 z-30 grid place-items-center bg-canvas/70 p-4 sm:p-6 backdrop-blur safe-bottom`, `role="dialog" aria-modal="true"` with a unique `aria-labelledby`, an inner `w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-card`, a title `<h2>`, body copy, an error `<p>` (line 237 pattern), and a footer `<div class="mt-5 flex justify-end gap-2">` with a ghost Cancel/close button and the action button. **Ref mapping:** cancel + reopen dialogs bind the error `<p v-if="lifecycleError">{{ lifecycleError }}</p>` and `:loading="lifecycleTransitioning"` / `:disabled="lifecycleTransitioning"`; the delete dialog binds `removeError` and `removing`. Copy per dialog:
     - Cancel: title "Cancel this poll?", body "Participants will no longer be able to vote. You can reopen it later — votes are kept." action `<Button variant="danger" :loading="lifecycleTransitioning" @click="confirmCancel">Cancel poll</Button>`.
     - Reopen: title "Reopen this poll?", body for completed "Reopening clears the final time and lets participants vote again." (use a computed that picks completed-vs-cancelled wording, or a single line "Participants will be able to vote again. Any finalized time is cleared.") action `<Button variant="primary" :loading="lifecycleTransitioning" @click="confirmReopen">Reopen poll</Button>`.
     - Delete: title "Delete this poll?", body "This permanently removes the poll and every response. This cannot be undone." action `<Button variant="danger" :loading="removing" @click="confirmDelete">Delete poll</Button>`.

8. **PublicPoll.vue — verify + refine the closed state.** `isOpen` (line 47) is `status === 'open'`, so both `completed` and `cancelled` already disable every voting control (`:disabled="!isOpen"` on toggles line 236 and inputs lines 256/270, the sticky bar `v-if="poll && isOpen"` at line 314 vanishes, and the intro chip flips to "Closed" at lines 142-149). No new `cancelled` branch is needed. ONLY refine the closed banner copy (lines 208-213): the current text "This poll is closed — voting is no longer open, but you can still view results." is accurate for both completed and cancelled, so keep it OR, if you want precision, branch the sentence on `poll.status === 'cancelled'` ("This poll was cancelled by the organizer — voting is closed, but you can still view results.") vs completed ("A final time has been chosen — voting is closed, but you can still view results."). Keep the banner inside `v-if="!isOpen"` (line 209). Do NOT touch the toggle/disabled wiring — it is already correct.

9. **Add tests — `frontend/src/views/__tests__/PollManage.spec.ts` (NEW).** Mirror the mocking pattern in `Dashboard.spec.ts` (hoist + `vi.mock('@/lib/api/client', ...)` so the real store runs against a real Pinia; stub `RouterLink` with `RouterLinkStub`). Provide a `makePoll()` factory returning an `OwnedPoll` shape (id, title, publicToken, timezone, status, finalSlotId, completedAt, dates: []). Mock the route `id` param via `vi.mock('vue-router', ...)` returning `useRoute` with `{ params: { id: '42' } }` and a spyable `useRouter().push`. Cover:
   - Open poll → header shows the "Open · gathering responses" pill, the Edit `RouterLink` resolves `to === '/polls/42/edit'`, the "Cancel poll" button renders, no "Reopen poll" button.
   - Completed poll → "Completed" pill, "Reopen poll" button present, Edit link present.
   - Cancelled poll → "Cancelled" pill (neutral), BestSlotBloom replaced by the "This poll is cancelled" card, "Reopen poll" button present, NO Edit link.
   - Clicking "Cancel poll" opens the confirm dialog (`role="dialog"` appears); confirming calls `POST /api/polls/42/cancel` (assert the mocked `post` was called with that path); a thrown error keeps the dialog open and renders the coral error text from `lifecycleError`.
   - Clicking "Reopen poll" (completed/cancelled fixtures) → confirm → calls `POST /api/polls/42/reopen`.
   - Clicking "Delete poll" → confirm → calls `DELETE /api/polls/42` (the mocked `del`) and pushes `/dashboard` (assert the router `push` spy).
   Assert against the actually-mocked client functions (`post`/`del`) that phase 04's store calls.

10. **Add tests — `frontend/src/views/__tests__/PublicPoll.spec.ts` (NEW or extend).** Mirror the public store mocking (mock `@/lib/api/public-poll` so `getPublicPoll`/`getResults` resolve controlled data; stub `RouterLink`). Cover: a `status: 'cancelled'` poll renders the "Closed" intro chip, shows the closed banner, disables the slot toggles and the name/email inputs (`disabled` attribute present), and the sticky submit bar is NOT rendered; a `status: 'open'` poll renders the sticky submit bar and enabled inputs. Assert results are still shown (the Results tab / leaning label renders regardless of status).

11. **Run the layer gates (Verification) and fix any failures** before declaring done.

## Verification
Run inside `frontend/`:
- `npm run lint` (oxlint + eslint, --fix) — clean.
- `npm run format` (prettier) — no diff.
- `npm run type-check` (vue-tsc --build) — passes; confirms the store action names + refs line up with what PollManage destructures.
- `npm run test:unit -- PollManage PublicPoll` (scoped) — the new view specs pass; then a full `npm run test:unit` to confirm nothing else regressed.
- `npm run build` — succeeds.
- Manual UI check (optional): start the frontend, open `/polls/:id` for an open poll → see Edit link + "Cancel poll"; cancel it → pill flips to "Cancelled", BestSlotBloom replaced by the cancelled card, Edit link gone, "Reopen poll" appears; open the same poll's `/p/:publicToken` in another tab → "Closed" chip, banner shown, voting controls disabled, no submit bar, Results tab still works. Reopen → controls re-enable. Delete → redirected to `/dashboard`.

## Acceptance
- [x] `PollManage.vue` renders exactly one status pill matching `status`: `open` → pollen "Open · gathering responses", `completed` → mint "Completed", `cancelled` → neutral "Cancelled".
- [x] An Edit link to `/polls/:id/edit` is shown for `open` and `completed` polls and hidden for `cancelled`.
- [x] An open poll shows a "Cancel poll" action; a cancelled or completed poll shows a "Reopen poll" action; all states show a "Delete poll" action — each gated behind a confirm dialog that keeps open and shows a coral error on failure.
- [x] Cancelling calls `pollStore.cancel(id)` (`POST /api/polls/:id/cancel`), reopening calls `pollStore.reopen(id)` (`POST /api/polls/:id/reopen`) and re-loads results, deleting calls `pollStore.remove(id)` (`DELETE /api/polls/:id`) and routes to `/dashboard`.
- [x] A cancelled poll's manage view replaces the BestSlotBloom completed copy with a neutral "This poll is cancelled" card (BestSlotBloom.vue is NOT edited).
- [x] `PublicPoll.vue` for a `cancelled` (or `completed`) poll shows the "Closed" chip + banner, disables all voting controls, hides the sticky submit bar, and still renders results.
- [x] New co-located specs `PollManage.spec.ts` and `PublicPoll.spec.ts` pass; `npm run lint`, `npm run type-check`, `npm run test:unit`, and `npm run build` are all green.
