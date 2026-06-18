# Mobile Calendar Editor (Redesign A)

**Slug:** `mobile-calendar-editor` (folder: `docs/plans/2026-06-18-mobile-calendar-editor/`)
**Created:** 2026-06-18
**Status:** planned

## Goal
Replace the one-date-at-a-time candidate-times editor with a calendar multi-select + bulk-slot-apply flow on mobile and desktop, behind a `Calendar | List` toggle, while emitting the identical `CreatePollPayload` (no backend change).

## Scope
- `frontend/src/views/PollEditor.vue`: integrate the new editor + segmented toggle over the shared `dates[]` ref
- new `frontend/src/components/CalendarDateEditor.vue`, `SlotPresetChips.vue`
- new `frontend/src/lib/slotPresets.ts` (fixed app-wide presets)
- reuse `DateSlotEditor.vue`, `DateCard.vue`, `SlotRow.vue` for the List view + per-date override
- `frontend/src/composables/useBreakpoint.ts` (created by the `responsive-foundations` plan)

## Out of scope
- Any backend / API / DTO change — payload is byte-identical to today's
- Drag-reorder of dates or slots (keeps `sortOrder` unset; revisit only if reorder is added)
- `closesAt` (stays PATCH-only, excluded from create)

## Constraints
- `buildPayload()` lives in `PollEditor.vue` (~lines 73–88); `pollStore.create()` stays untouched
- Depends on the `responsive-foundations` plan (`useBreakpoint` + safe-area/touch-target utilities) and on the editor mockups
- Frontend-only verification: `cd frontend && npm run build && npm run lint`

## Acceptance criteria
- [ ] Calendar multi-select + bulk-apply produces a `CreatePollPayload` identical to the list flow's
- [ ] `Calendar | List` toggle switches views over the same `dates[]`, persisted in localStorage
- [ ] Per-date override still works via the reused `DateCard`/`SlotRow`
- [ ] Touch targets ≥44px; preview becomes a bottom-sheet on phone
- [ ] build + lint green

## Phases
1. [01-slot-presets](01-slot-presets.md) — `slotPresets` constant + `SlotPresetChips` · _solo_
2. [02-calendar-date-editor](02-calendar-date-editor.md) — month grid + multi-select + bulk-apply · _solo_
3. [03-editor-integration](03-editor-integration.md) — `Calendar|List` toggle + reuse List/override + localStorage · _solo_
4. [04-responsive-preview](04-responsive-preview.md) — bottom-sheet preview + touch targets · _solo_

## Open questions
- Confirm preset default ranges (Morning 09:00–12:00, Noon/Afternoon 12:00–14:00, Evening 18:00–21:00) before coding the constant.
