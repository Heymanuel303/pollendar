# Phase 2: Desktop participant-matrix table

**Plan:** [2026-06-18-participant-matrix](00-overview.md)
**Depends on:** 01-vote-results-toggle.md
**Execution:** solo

## Context
The feature adds a `Vote | Results` view to the public poll: tri-state voting stays, and a per-participant matrix (desktop table / mobile card-stack) shows who voted and what they picked, for anyone with the share link, on open AND closed polls. The matrix data is owned by the `who-voted-endpoint` plan: its phase 2 adds `usePublicPollStore().loadParticipants(token, opts?)` plus `participants: ParticipantRow[]`, `participantsState`, `participantsTotal`, `participantsHasMore` (rows carry `displayName` + per-slot `answers`, NEVER `email`). This phase builds the net-new `ParticipantMatrix.vue` desktop table and mounts it in the Results tab from phase 1; phase 3 then layers the mobile card-stack on top via `useBreakpoint`.

## Objective
Build ParticipantMatrix.vue desktop table: rows = participants (including the current voter's own editable row with live tri-state controls), columns = slots grouped by date, cells = yes/maybe/no states, sticky left name column, winning-slot bloom; consume the publicPollStore participant-rows action.

## Files to touch
- `frontend/src/components/ParticipantMatrix.vue` — NEW component. Desktop `<table>` (mirrors `AvailabilityGrid.vue`'s sticky/scroll/colspan structure) with one row per `ParticipantRow` from the store, an extra editable "You" row driven by `v-model`-style `answers`, date-group + slot sub-header rows, per-cell yes/maybe/no glyphs, sticky left name column, and `bloom-bg` on the winning slot's column. Pure presentational + an editable-row contract; owns NO fetch (the parent calls `store.loadParticipants`).
- `frontend/src/views/PublicPoll.vue` — mount `<ParticipantMatrix>` inside the Results tab created by phase 1; call `store.loadParticipants(token.value)` on mount (and when the Results tab first activates); pass `dates`, `timezone`, `participants`, `winningSlotId`, the voter's own `displayName`, and the live `answers` (two-way) into the matrix.

## Steps
1. **Create `frontend/src/components/ParticipantMatrix.vue`** (net-new — it does not exist). `<script setup lang="ts">` importing:
   - `import { computed } from 'vue'`
   - `import AvailabilityToggle from '@/components/AvailabilityToggle.vue'` (reused for the editable "You" row cells — re-tapping the active option cycles back to `null`, matching `AvailabilityToggle.vue:29–32`).
   - `import { formatDate, formatSlotRange } from '@/lib/utils/timezone'` (same helpers `AvailabilityGrid.vue` uses; timezone-safe, render anchored in UTC).
   - `import type { Availability, PollDate, ParticipantRow } from '@/lib/api/types'` (these are the real wire types; `ParticipantRow` and `ParticipantResponseAnswer` are added by `who-voted-endpoint` phase 2 — see Gotchas).

2. **Define props + emits** mirroring the `v-model` pattern used by `AvailabilityToggle`/`PollSlotRow`:
   ```ts
   const props = defineProps<{
     dates: PollDate[]
     timezone: string
     participants: ParticipantRow[]
     /** Live results' winning slot id (string), or null — drives the bloom column. */
     winningSlotId: string | null
     /** The current voter's display name for their own editable row label (defaults below). */
     yourName?: string
     /** The current voter's per-slot answers, keyed by slot id; v-model-style. null = unanswered. */
     answers: Record<string, Availability | null>
     /** When false, the "You" row renders read-only cells (closed-poll Vote-disabled state). */
     editable?: boolean
   }>()
   const emit = defineEmits<{ 'update:answers': [slotId: string, value: Availability | null] }>()
   ```
   The view updates its `reactive` answers map on `@update:answers="(id, v) => (answers[id] = v)"` (same shape as the existing `@update:model-value="answers[slot.id] = $event"` in `PublicPoll.vue:180`). Default `editable` to `true` and `yourName` to `'You'` via `withDefaults`.

3. **Flatten the slot column order once.** Mirror `AvailabilityGrid.vue`'s structure: iterate `props.dates` for the date-group header (`:colspan="date.slots.length"`) and the slot sub-header, and build a `computed` flat `orderedSlotIds: string[]` from `dates[].slots[].id` (dates and slots are already ordered by `sortOrder` on the wire — do NOT re-sort) so each participant row can read its cells in column order. Slot ids ARE STRINGS (BigInt stringified on the wire — see `types.ts:26–33`).

4. **Build a per-participant lookup.** For each `ParticipantRow`, derive a `computed` `Map<participantId, Map<slotId, Availability>>` (or a small `answerFor(row, slotId)` helper) from `row.answers` — each `ParticipantResponseAnswer` has `{ slotId, availability }` (note: `slotId`, NOT `pollSlotId` — that field name is only on the submission `ResponseAnswer`). A slot with no matching answer renders an empty/"—" cell (defensive join guard, like `AvailabilityGrid.vue`'s `ZERO_TALLY`).

5. **Render the table** following the `AvailabilityGrid.vue:64–154` sticky pattern verbatim where possible:
   - Wrapper: `<div class="overflow-x-auto rounded-xl border border-line bg-canvas">` with `<table class="w-full min-w-[640px] border-collapse text-sm">`.
   - `<thead>` two rows: a date-group row (`th` per `date` with `:colspan="date.slots.length"`, label `formatDate(date.eventDate, timezone)`) and a slot sub-header row (`th` per slot, label `formatSlotRange(slot, timezone)`, plus the `✦ In bloom` chip when `slot.id === winningSlotId`). The first `th` of each header row is the sticky name corner: `class="sticky left-0 z-10 bg-canvas …"` (copy the exact sticky classes from `AvailabilityGrid.vue:70` / `:85`).
   - `<tbody>`: first the **editable "You" row**, then one row per `props.participants`.

6. **Editable "You" row.** First `<td>` is the sticky name cell (`sticky left-0 z-10 bg-canvas`) showing `yourName`, visually distinguished (e.g. `text-pollen` accent or a small "you" tag) so the voter spots their own row. For each slot column, render an `<AvailabilityToggle>` when `editable`, wired:
   ```html
   <AvailabilityToggle
     :model-value="answers[slot.id] ?? null"
     :label="`Your availability for ${formatSlotRange(slot, timezone)}`"
     @update:model-value="emit('update:answers', slot.id, $event)"
   />
   ```
   When `!editable` (closed poll), render the same read-only yes/maybe/no glyph used by participant rows instead of the toggle. The winning column cell adds `bloom-bg` (see step 8).

7. **Participant rows.** For each `row` in `props.participants`: sticky first `<td>` with `row.displayName` (text only — there is NO email field on `ParticipantRow`; the privacy contract excludes it at the Prisma select level, so it cannot leak here). For each slot column, render a read-only cell from `answerFor(row, slot.id)`:
   - `available` → yes glyph: `<span class="pollen-dot inline-block h-3 w-3">` (matches `AvailabilityGrid.vue:126`).
   - `maybe` → `<span class="inline-block h-3 w-3 rounded-full ring-1 ring-maybe/60">` (matches `:132`).
   - `unavailable` → `<span class="inline-block h-3 w-3 rounded-full bg-no">` (matches `:138`).
   - no answer → muted `—` (`text-mute`).
   Give each glyph a `data-availability` / `aria-label` (`Yes`/`Maybe`/`No`/`No answer`) for accessibility and testability.

8. **Winning-slot bloom.** Compute `winningSlotId` from the prop. For every body cell whose `slot.id === props.winningSlotId`, add the `bloom-bg` class (the radial pollen wash defined in `main.css:90–93`) and a `:data-testid="slot.id === winningSlotId ? 'matrix-bloom' : undefined"` hook — exactly the `AvailabilityGrid.vue:115–119` treatment. Bloom marking applies ONLY in this results matrix. Add the same `prefers-reduced-motion: reduce` respect already covered by `main.css:102–107` for `.animate-bloom`/`.animate-settle`; `.bloom-bg` is a static wash (no animation), so no extra rule is required, but do NOT introduce any new bloom *animation* that ignores the reduced-motion guard.

9. **Empty / loading states.** When `props.participants.length === 0`, render a centered "No responses yet" empty state inside the section (the editable "You" row still shows so a fresh voter can vote from the matrix). Keep the component itself stateless about loading — the parent decides whether to show a spinner vs the matrix based on `store.participantsState`.

10. **Wire into `frontend/src/views/PublicPoll.vue`** (the Results tab is created by phase 1 — depend on its `activeTab` / `isResultsTab` state, do NOT re-implement the toggle here):
   - Import: `import ParticipantMatrix from '@/components/ParticipantMatrix.vue'`.
   - Destructure the new store refs from phase 1's `storeToRefs(store)` call: add `participants`, `participantsState` (added by `who-voted-endpoint`; if that store action is not yet on disk when this phase runs, see Gotchas for the fallback).
   - In `onMounted` (currently `PublicPoll.vue:26–30`), after `store.loadResults(token.value)`, call `await store.loadParticipants(token.value)`. Optionally also lazy-load on first Results-tab activation (watch the phase-1 `activeTab`) to avoid the fetch when a voter never opens Results.
   - In the Results tab template region, render:
     ```html
     <ParticipantMatrix
       :dates="poll.dates"
       :timezone="poll.timezone"
       :participants="participants"
       :winning-slot-id="bestSlotId"
       :answers="answers"
       :editable="isOpen"
       @update:answers="(id, v) => (answers[id] = v)"
     />
     ```
     Reuse the existing `bestSlotId` computed (`PublicPoll.vue:35`) and the existing `answers` reactive map (`:23`) and `isOpen` (`:32`) — do NOT duplicate them. On a closed poll `editable=false` keeps the matrix visible with the "You" row read-only (the spec's closed-poll behavior; phase 1 already reworked the `PublicPoll.vue:146–155` hard-replace branch so the Results matrix stays visible).

11. **Do NOT** add pagination/virtualization in this phase (the endpoint supports `limit/offset`, but the matrix-scale threshold is an open question on the overview — load the default page only). Do NOT touch the backend, the API client, or the store action contract (owned by `who-voted-endpoint`).

## Verification
- cd frontend && npm run build && npm run lint
- Manual desktop check: open a poll's Results tab — the name column stays pinned while scrolling slot columns horizontally; the winning slot column shows the bloom wash; the "You" row's tri-state toggles edit the same `answers` the Vote tab uses (and re-tapping an active option clears it); participant rows show yes/maybe/no glyphs and NO email anywhere; on a closed poll the matrix still renders with the "You" row read-only.

## Acceptance
- [x] `frontend/src/components/ParticipantMatrix.vue` exists and renders a desktop `<table>` with a sticky left name column (`sticky left-0 z-10 bg-canvas`), date-group + slot sub-header rows, one row per `participants` prop, and a leading editable "You" row.
- [x] The "You" row uses `<AvailabilityToggle>` (or read-only glyphs when `editable=false`) and emits `update:answers` so it edits the same `answers` map the Vote tab uses; re-tapping the active option clears it.
- [x] Each participant cell shows the correct yes/maybe/no glyph (or `—` for no answer), shows `displayName` only, and exposes NO `email`.
- [x] The winning slot column (`slot.id === winningSlotId`) carries `bloom-bg` with a `matrix-bloom` test hook, and no new bloom animation bypasses the `prefers-reduced-motion` guard.
- [x] `PublicPoll.vue` mounts `<ParticipantMatrix>` in the Results tab, calls `store.loadParticipants(token.value)`, and the matrix stays visible (You row read-only) on a closed poll.
- [x] `npm run build` and `npm run lint` are green in `frontend/`.
