# Phase 3: Mobile per-slot card-stack + touch targets

**Plan:** [2026-06-18-participant-matrix](00-overview.md)
**Depends on:** 02-desktop-matrix-table.md
**Execution:** solo

## Context
The feature adds a `Vote | Results` view to the public poll (`/p/:publicToken`): tri-state voting stays, and a per-participant matrix shows who voted and what they picked, visible to anyone with the share link for open **and** closed polls. Phase 1 shipped the `Vote | Results` toggle as pure local state (no backend). Phase 2 built the desktop `ParticipantMatrix.vue` table whose data — `displayName` + per-slot answers, **never email** — comes from a `publicPollStore` participants action added by the separate `who-voted-endpoint` plan (`GET /api/public/polls/:token/participants-responses`). This phase adds the **mobile** variant of that same component: a per-slot card-stack chosen at runtime via `useBreakpoint` (from the `responsive-foundations` plan).

## Objective
Add the mobile variant of ParticipantMatrix via useBreakpoint DOM-switch: one full-width card per slot, name chips grouped under Yes/Maybe/No (+N more), with the current voter's tri-state control inline at the top of each card; bump touch targets to >=44px.

## Files to touch
- `frontend/src/components/ParticipantMatrix.vue` — add the mobile branch. Wrap the existing Phase-2 desktop `<table>` and the new mobile card-stack in a `useBreakpoint`-driven DOM switch (`v-if="bp.isPhone"` renders cards, `v-else` renders the Phase-2 table). Build the per-slot card markup: one full-width card per slot (walk `dates[].slots[]`), the current voter's `AvailabilityToggle` inline at the top, then voter name chips grouped under Yes / Maybe / No with a `+N more` overflow affordance.
- `frontend/src/assets/main.css` — **read-only dependency, do NOT edit.** The `@utility touch-target` (44px min), `safe-bottom`, `safe-top`, `pb-with-footer` utilities are added by the `responsive-foundations` plan _after_ the current line 107. Phase 3 consumes `touch-target`; it must not redefine it. If the utility is absent at execution time, that plan has not landed — surface it as a blocker rather than re-adding the utility here.

## Steps
1. **Confirm the inbound contracts before coding** (all created by earlier/sibling plans; verify on disk, do not invent):
   - `frontend/src/composables/useBreakpoint.ts` exports `useBreakpoint()` → `{ isPhone, isTablet, isDesktop }` (reactive `Ref<boolean>`s; `isPhone` is the phone breakpoint). It does NOT exist in the initial codebase (no `frontend/src/composables/` dir today) — it is created by `responsive-foundations` phase 1. Plan against that exact shape; the export IS `isPhone`, so import it under that name in this component.
   - `publicPollStore` exposes a participants action + reactive state (created by `who-voted-endpoint` phase 2). Assume a `participants` ref shaped like `Array<{ id: string; displayName: string; answers: Record<string /*slotId*/, Availability> }>` plus `total`/`hasMore`, and a `loadParticipants(token)` action. Mirror the store's existing `RequestState` + `load`/`loadResults` action pattern (`publicPollStore.ts:32`, `:46`, `:84`). `displayName` only — never reference an `email` field (the endpoint does not return one).
   - The current voter's own answers live in `PublicPoll.vue`'s local `answers` reactive (`PublicPoll.vue:23`) keyed by slot id; Phase 2 already passes the voter's choice + an `@update:availability`-style emit down to `ParticipantMatrix`. Reuse those same props/emits for the mobile card's inline toggle — do not introduce a parallel state channel.

2. **Set up the breakpoint switch in `ParticipantMatrix.vue`.** In `<script setup lang="ts">`, import `useBreakpoint` from `@/composables/useBreakpoint` and call it: `const bp = useBreakpoint()`. Guard for SSR safety per the gotcha — `useBreakpoint` itself owns the `typeof window !== 'undefined'` guard, so the component just reads `bp.isPhone.value`. In the template, split the existing Phase-2 root: `<div v-if="bp.isPhone" class="space-y-3" data-testid="matrix-cards"> … </div>` for the card-stack and `<div v-else data-testid="matrix-table"> … existing Phase-2 table … </div>`. Keep the shared empty/loading/error states (mirroring `PublicPoll.vue:99-114`) outside the switch so they render identically on both layouts.

3. **Derive per-slot participant groups** in `<script setup>`. Add a computed that, for each slot, partitions `store.participants` into three name lists by their answer for that slot. Reuse the `Availability` literal from `@/lib/api/types` (`'available' | 'maybe' | 'unavailable'`). Sketch:
   ```ts
   import type { Availability } from '@/lib/api/types'
   const GROUPS = ['available', 'maybe', 'unavailable'] as const
   function namesForSlot(slotId: string, kind: Availability): string[] {
     return store.participants
       .filter((p) => p.answers[slotId] === kind)
       .map((p) => p.displayName)
   }
   ```
   Do not aggregate into tallies/scores — this is per-name (mirror the explorer note: AvailabilityToggle/ParticipantMatrix are per-name, not the score UI of `ResultsTable`/`AvailabilityGrid`).

4. **Build the card-stack markup.** Walk `dates[]` then `date.slots[]` (same iteration as `PublicPoll.vue:165-183` and the Phase-2 table) so cards appear in poll order grouped by date. Each card is a **full-width** block — `class="w-full rounded-2xl border border-line bg-surface p-4 shadow-card"` plus `bloom-bg border-pollen/40 shadow-glow` when `slot.id === winningSlotId` (reuse the `winningSlotId` computed from Phase 2 / `AvailabilityGrid.vue:33`). Critically: **no horizontal scroll** — use `w-full` + `flex-col` stacking, never the desktop table's `overflow-x-auto`/`min-w-[640px]` pattern (`AvailabilityGrid.vue:64-65`). Card header: slot label + `formatSlotRange(slot, timezone)` (import from `@/lib/utils/timezone`, as `AvailabilityGrid.vue:4` does), date heading per group via `formatDate(date.eventDate, timezone)`, and the `✦ In bloom` pill for the winner (copy the chip from `AvailabilityGrid.vue:94-98`).

5. **Put the voter's tri-state control inline at the top of each card.** Render `<AvailabilityToggle :model-value="voterAnswers[slot.id] ?? null" @update:model-value="emit('update:availability', { slotId: slot.id, value: $event })" :label="`Your availability for ${slotLabel}`" />` (component imported at `PollSlotRow.vue:3`; emit shape matches whatever Phase 2 chose — reuse it verbatim). Wrap it in a labeled row at the very top of the card body (e.g. a `text-xs uppercase tracking-widest text-mute` "Your vote" caption) so it reads as the voter's own control, distinct from the read-only name chips below. Add the `touch-target` utility class to the toggle's wrapper so the buttons meet the ≥44px (2.75rem) minimum on touch; the toggle's own buttons (`AvailabilityToggle.vue:48-52`, currently `px-3 py-1.5`) should sit inside a `touch-target` container — do not edit `AvailabilityToggle.vue`, apply the sizing from the card via the wrapper.

6. **Render the grouped name chips.** Below the voter control, three labeled groups (Yes / Maybe / No) using the existing color tokens (`bg-yes/text-canvas`, `bg-maybe`, `bg-no/text-moonlight` per `AvailabilityToggle.vue:22-24` and `--color-yes/maybe/no` in `main.css:17-19`). Each group: a small caption + a `flex flex-wrap gap-2` of name chips (`rounded-full px-3 py-1 text-sm`). Show the first N chips (recommend N = 6) and collapse the rest into a single `+{count - N} more` chip; clicking it expands the group (local `Set<string>` of expanded `slotId|kind` keys, toggled on tap). Make the `+N more` chip a real `<button type="button">` with `touch-target` and an `aria-expanded` so it is keyboard- and screen-reader-accessible. When a group has zero names, render a muted "—" / "No one yet" placeholder rather than an empty row.

7. **Trigger the participants load.** The data fetch is owned by `PublicPoll.vue` (it already calls `store.load`/`store.loadResults` in `onMounted`, `PublicPoll.vue:26-30`); Phase 2 wires `store.loadParticipants(token)` there for the Results tab. Phase 3 adds **no** new fetch — the mobile cards read the same `store.participants` ref Phase 2 introduced. If Phase 2 lazy-loads participants only when the Results tab opens, the mobile branch inherits that for free. Confirm no duplicate fetch is introduced.

8. **Accessibility + reduced-motion.** Group captions get `<h3>`/`role` semantics or `aria-label`s so the card structure is announced. The winning card's `bloom-bg`/`shadow-glow` is decorative; it already respects `prefers-reduced-motion` via `main.css:101-107` (no new animation added here). Ensure every tappable element (toggle buttons, `+N more`) carries `touch-target`.

## Verification
- `cd frontend && npm run build && npm run lint`
- Manual UI check at a phone-width viewport (≤640px, DevTools device toolbar): toggle to the **Results** tab and confirm the layout switches to one full-width card per slot with **no horizontal scroll**; the voter's Yes/Maybe/No control sits at the top of each card and re-tap cycles to none; names appear grouped under Yes/Maybe/No with `+N more` expanding the overflow; the winning slot's card blooms.
- Resize across the `useBreakpoint` threshold and confirm the DOM swaps between the Phase-2 desktop table (`data-testid="matrix-table"`) and the mobile card-stack (`data-testid="matrix-cards"`).
- On a closed poll (`status !== 'open'`), confirm Results cards still render and the inline voter toggle is disabled (closed-poll disabling is owned by Phase 1; verify it propagates to the mobile toggle wrapper).

## Acceptance
- [ ] At ≤640px the Results view renders one full-width card per slot (no `overflow-x` scroll), grouped by date in poll order.
- [ ] Each card shows the current voter's tri-state `AvailabilityToggle` inline at the top, bound to the same `answers` state as the desktop table (single source of truth, no duplicate fetch).
- [ ] Name chips are grouped under Yes / Maybe / No with a working `+N more` expand control; chips show `displayName` only (never email).
- [ ] All tappable controls (toggle buttons, `+N more`) use the `touch-target` utility and measure ≥44px on touch.
- [ ] The DOM switches between `data-testid="matrix-cards"` and `data-testid="matrix-table"` across the `useBreakpoint` breakpoint.
- [ ] `cd frontend && npm run build && npm run lint` pass clean.
