# Phase 4: Responsive preview + touch targets

**Plan:** [2026-06-18-mobile-calendar-editor](00-overview.md)
**Depends on:** 03-editor-integration.md
**Execution:** solo

## Context
This plan replaces the one-date-at-a-time candidate-times editor with a calendar multi-select + bulk-slot-apply flow behind a `Calendar | List` toggle, emitting the IDENTICAL `CreatePollPayload` with no backend change. Phase 3 already wired the toggle and the new `CalendarDateEditor` into `PollEditor.vue` over the shared `dates[]` ref. This final phase makes the editor screen itself usable on a phone: the `lg:`-only sticky preview sidebar becomes a "Show preview" bottom-sheet below `lg`, and the reused `DateCard` / `SlotRow` controls get bumped to a ≥44px tap zone. No editor data flow, validation, or `buildPayload()` mapping changes — this is layout + tap-target only.

## Objective
Make the editor responsive: fold the `lg:`-only preview sidebar into a "Show preview" bottom-sheet on phone via `useBreakpoint`, and bump touch targets on the reused `DateCard` / `SlotRow` controls to >=44px.

## Files to touch
- `frontend/src/views/PollEditor.vue` — split the right-hand preview `<aside>` (currently `lg:sticky lg:top-24`, line 164) into the existing sticky sidebar shown only at `lg+`, plus a new phone-only "Show preview" trigger button + a bottom-sheet overlay that renders the SAME `previewRows` markup; add `useBreakpoint` + a `showPreview` ref. The `<grid>` at line 116 stays `grid-cols-1 ... lg:grid-cols-[minmax(0,1fr)_360px]` so the right column simply collapses below `lg`.
- `frontend/src/components/DateCard.vue` — add `touch-target` (or explicit `min-h-11`) to the "Remove date" button (line 61-68, today `px-3 py-2`) and the "+ Add slot" button (line 85-91, today `px-2 py-1.5`) so both clear 44px on phone.
- `frontend/src/components/SlotRow.vue` — add `touch-target` to the All-day / Set-times segmented toggle buttons (lines 78-99, today `px-2.5 py-1`) and the "Remove slot" button (lines 121-128, today `px-2 py-1`); add a `min-w-*` to the `type="time"` inputs (`timeFieldClass`, line 55-56) so `field-sizing-content` doesn't shrink them below readability at 375px.
- `frontend/src/assets/main.css` — NO edits expected; `.touch-target` and `.safe-bottom` are produced by `responsive-foundations` 01-foundations.md. Verify they exist; if absent, this phase is blocked (see Gotcha in overview).

## Steps
1. **Pre-flight (blocker check).** Confirm `frontend/src/composables/useBreakpoint.ts` exists and exports `useBreakpoint()` returning reactive `{ isPhone, isTablet, isDesktop }`, and that `frontend/src/assets/main.css` defines the `@utility touch-target` (min 2.75rem × 2.75rem) and `@utility safe-bottom` rules. Both come from `responsive-foundations` phase 1. If either is missing, STOP — this phase cannot proceed (record the blocker; do not hand-roll a substitute composable or utility here).

2. **`PollEditor.vue` — import the composable.** In the `<script setup>` block (top, alongside the existing `import { computed, ref } from 'vue'` at line 2), add `import { useBreakpoint } from '@/composables/useBreakpoint'`. Inside the setup body (near the existing refs, after `previewRows` ~line 61), add `const { isPhone } = useBreakpoint()` and `const showPreview = ref(false)`. Do NOT touch `dates` (line 29), `buildPayload()` (lines 73-88), `isValid()` (lines 63-71), or `submit()` (lines 90-101).

3. **`PollEditor.vue` — gate the sticky sidebar to `lg+`.** On the right `<aside>` (line 164), add `hidden lg:block` so the existing sticky preview column only renders at `lg` and up (`class="hidden lg:block lg:sticky lg:top-24 lg:self-start"`). Its inner `<section>` (the preview card + "Create poll" button) stays byte-for-byte as today. The grid at line 116 is unchanged; below `lg` the right track collapses and the left form spans full width.

4. **`PollEditor.vue` — add the phone "Show preview" trigger.** Inside the left form column `<div class="space-y-6">` (line 118), after the `<DateSlotEditor>` / editor block (line 160-161, whatever phase 3 left there), add a `lg:hidden` button: `class="touch-target inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 font-medium text-dim transition hover:text-moonlight"`, label `⬇ Show preview`, `type="button"`, `@click="showPreview = true"`. This button never shows at `lg+` (the sidebar covers that). It does NOT trigger submit.

5. **`PollEditor.vue` — extract the preview body into a reusable fragment.** To avoid duplicating the preview markup (lines 165-215: the `Preview` header, title/description/pill, timezone + closes line, "How people will respond" `previewRows` loop, and the create button block), pull the inner `<section>` content into a small local sub-template. Two acceptable approaches — pick one and keep it simple:
   - (a) Define a local `defineComponent`/SFC fragment is overkill; instead keep ONE copy of the `<section>` markup and render it in both slots via a Vue `<template>` + a boolean, OR
   - (b) Render the sticky sidebar `<section>` as-is at `lg+`, and in the bottom-sheet reuse the SAME `previewRows`/`title`/`description`/`closesPreview`/`timezone` bindings in a near-identical `<section>` body. Duplication of static markup is acceptable here since both bind the same computed data; do NOT introduce a new shared component file (out of scope) unless it is trivially clean.
   Either way the data source is identical: `previewRows` (line 51-61), `title`, `description`, `closesPreview`, `timezone`, and `pollStore.creating` / `pollStore.error`. No new computed values.

6. **`PollEditor.vue` — add the bottom-sheet overlay.** After the grid `</div>` closing the two-column layout (around line 233), add a phone-only sheet, rendered when `isPhone && showPreview` (use `v-if="isPhone && showPreview"`, and wrap in `<Teleport to="body">` so it escapes the centered `<main>` stacking context):
   - A backdrop: `<div class="fixed inset-0 z-40 bg-canvas/70 backdrop-blur-sm lg:hidden" @click="showPreview = false">`.
   - The sheet panel: `<div class="safe-bottom animate-settle fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface shadow-card lg:hidden">` containing a drag-affordance bar + a header row with a "Done"/✕ close button (`type="button"`, `touch-target`, `@click="showPreview = false"`) and the SAME preview body from step 5. Use `animate-settle` (existing `@theme` animation token) for the slide/fade-in; do NOT use a native `<dialog>`. `safe-bottom` (from foundations) adds notch padding.
   - Keep the create flow reachable from the sheet: the sheet's footer reuses the existing "Create poll" button markup (lines 217-230) bound to `@click="submit"`, `:disabled="pollStore.creating"`, and the `pollStore.error` line — identical to the sidebar's, so phone users can publish without closing the sheet.

7. **`DateCard.vue` — touch targets.** Add the `touch-target` utility class to the "Remove date" button (line 61-68; keep its `px-3 py-2` and icon, just append `touch-target` so it reaches ≥44×44px) and to the "+ Add slot" button (line 85-91; append `touch-target`). Do NOT change `updateSlot` / `removeSlot` / `addSlot` (lines 26-42) or the emitted `update:modelValue` payload shape — `PollSlotInput` defaults (`{ startTime: '18:00', endTime: '20:00', isAllDay: false }`, line 39) stay exactly as-is so the upward `dates[]` mutations and thus `buildPayload()` output are unchanged.

8. **`SlotRow.vue` — touch targets + time-input min width.** (a) Append `touch-target` to BOTH segmented-toggle buttons (the All-day button lines 78-88 and the Set-times button lines 89-99 — add to each branch's class so the active `bg-yes` state and the inactive state both clear 44px height). (b) Append `touch-target` to the "Remove slot" button (lines 121-128). (c) In `timeFieldClass` (line 55-56), add a `min-w-[5.5rem]` (or `min-w-22`) alongside the existing `field-sizing-content ... px-2 py-1` so the `type="time"` inputs (lines 103-117) stay legible at 375px and don't collapse. Do NOT alter `patch()`, `setAllDay()`, the `label`/`startTime`/`endTime` computeds, or the `update:modelValue` slot shape (lines 15-47) — the slot object emitted upward is identical, preserving the payload.

9. **No-API-change guard (verify, do not edit).** Confirm `buildPayload()` in `PollEditor.vue` (lines 73-88) is untouched and still maps `dates.value` → `CreatePollPayload` exactly: each date → `{ eventDate, slots: slot.map(...) }`, each slot → `{ label?, ...(isAllDay ? { isAllDay: true } : { isAllDay: false, startTime, endTime }) }`. `sortOrder` stays unset on both `PollDateInput` and `PollSlotInput` (drag-reorder out of scope). `closesAtLocal` (line 28) is still excluded from create (PATCH-only). Because every Phase-4 change is layout/CSS only and the `DateCard`/`SlotRow` emits are unchanged, the `dates[]` ref content — and therefore the POST body — is byte-identical to today's.

10. **Cleanup.** Ensure `showPreview` resets to `false` on successful create is not required (router navigates away in `submit()`), but DO ensure the sheet does not render at `lg+` even if `showPreview` were true (the `v-if="isPhone && showPreview"` + `lg:hidden` classes both guard this). Remove any leftover duplicate `import` lines and run the linter to catch unused refs.

## Verification
- `cd frontend && npm run build` (type-check + vite build passes)
- `cd frontend && npm run lint` (no new lint errors; `useBreakpoint`/`showPreview` referenced, no unused vars)
- Manual viewport check at 375px (DevTools phone width): the right preview column is gone, a full-width `⬇ Show preview` button appears under the editor, tapping it slides up a bottom-sheet that shows the same preview rows + a working "Create poll" button; the sheet respects the bottom safe-area (no notch overlap); closing via backdrop or ✕ dismisses it.
- Manual viewport check at ≥1024px (`lg`): the bottom-sheet trigger and overlay are hidden, the sticky `lg:top-24` sidebar renders exactly as before, and the create button still lives in the sidebar.
- Touch-target check: in DevTools, the `SlotRow` All-day/Set-times toggle, the `SlotRow` remove ✕, the `DateCard` remove ✕, and the "+ Add slot" button each measure ≥44×44px at phone width.
- Payload parity check (manual): create a poll from the phone layout (Calendar or List) and confirm the POST body in the Network tab matches a poll created from the desktop layout for the same dates/slots — identical `dates[]`, no `sortOrder`, no `closesAt`.

## Acceptance
- [ ] Below `lg`, the sticky preview sidebar is replaced by a `⬇ Show preview` button that opens a safe-area-aware bottom-sheet (no native `<dialog>`), rendering the same `previewRows` + a functional "Create poll" action; at `lg+` the original sticky sidebar is restored and the sheet/trigger are hidden.
- [ ] `PollEditor.vue` consumes `useBreakpoint()` (`isPhone`) and a local `showPreview` ref; `buildPayload()` (lines 73-88), `isValid()`, `submit()`, and the `dates` ref are unchanged.
- [ ] `DateCard.vue` remove + add-slot controls and `SlotRow.vue` toggle + remove controls all carry `touch-target` (≥44×44px); `SlotRow` time inputs keep a `min-w` so they stay legible at 375px.
- [ ] The emitted `CreatePollPayload` is byte-identical to before this phase (same `dates[]` mapping, `sortOrder` unset, `closesAt` excluded); `pollStore.create()` untouched.
- [ ] `cd frontend && npm run build && npm run lint` both pass with changes left uncommitted.
