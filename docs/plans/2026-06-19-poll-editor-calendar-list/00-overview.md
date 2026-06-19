# Poll editor — calendar picker + editable-list split

**Slug:** `poll-editor-calendar-list` (folder: `docs/plans/2026-06-19-poll-editor-calendar-list/`)
**Created:** 2026-06-19
**Status:** in-progress

## Goal
Redesign the poll editor (`/polls/new` and `/polls/:id/edit`) so the candidate-times section is a **pure calendar day-picker** on the left (no `Calendar | List` toggle, no "Apply a time block" bulk-preset panel) with the Create/Save action anchored beneath it, and the **always-editable `DateSlotEditor` list** replaces the static preview on the right — the surface where users add custom slots and labels. Tapping a day stamps a fixed default slot; per-date slot/label editing happens in the list.

## Scope
- `frontend/src/components/CalendarDateEditor.vue` — strip to a tap-to-toggle day-picker; remove the `SlotPresetChips` bulk-apply panel; tapped days get a fixed `{ startTime: '18:00', endTime: '20:00', isAllDay: false }` slot.
- `frontend/src/views/PollEditor.vue` — calendar-left (sticky, ~360px) + anchored action / editable-list-right layout; remove the toggle, the desktop `<aside>` preview, and the phone preview bottom-sheet; mobile stacks calendar → list.
- `frontend/src/components/DateSlotEditor.vue` — heading copy only ("Times & labels" / "Customize each date") to avoid a duplicate "Candidate times" heading.
- `frontend/src/lib/editorViewPreference.ts` + `frontend/src/components/SlotPresetChips.vue` — deleted once orphaned (+ their specs).
- Tests: `PollEditor.spec.ts`, `CalendarDateEditor.spec.ts` updated; `editorViewPreference.spec.ts`, `SlotPresetChips.spec.ts` deleted.

## Out of scope
- Backend / API. `CreatePollPayload` and `UpdatePollPayload` must stay **byte-identical** — the shared `dates` (`PollDateInput[]`) ref remains the single source of truth bound by both editors.
- `DateCard` / `SlotRow` internal slot/label editing (already supports labels — reused as-is).
- Results / manage / public views.
- `frontend/src/lib/slotPresets.ts` (left in place — see open questions).

## Constraints
- Shared `dates` ref drives both editors ⇒ no payload divergence (`buildCreatePayload`/`buildEditPayload` unchanged).
- Edit-mode vote-lock preserved: voted (locked) days can't be removed by a calendar tap; voted slots stay locked in the list.
- Keep a11y on the day grid and the action button.
- Frontend commands run from `frontend/`: `npm run type-check`, `npm run lint`, `npx vitest run`, `npm run dev`.

## Acceptance criteria
- [ ] Calendar (left) is a pure day-picker — no toggle, no "Apply a time block" panel; tapping a day adds it with the fixed default slot.
- [ ] Editable `DateSlotEditor` list sits on the right (no static preview, no phone bottom-sheet); users add custom slots + labels there.
- [ ] Create/Save action + inline errors anchored beneath the calendar; left column sticky on lg+.
- [ ] Mobile (<lg) stacks calendar then list in one column, no toggle.
- [ ] Payloads byte-identical; edit-mode vote-locks intact.
- [ ] `editorViewPreference.ts` and `SlotPresetChips.vue` (+ specs) deleted; tree grep-clean.
- [ ] `npm run type-check`, `npm run lint`, `npx vitest run` all green.

## Phases
1. [01-calendar-picker-and-split-layout](01-calendar-picker-and-split-layout.md) — pure day-picker + calendar-left/list-right layout, preview & toggle removed, action anchored under the calendar; specs updated · _solo_ ✓
2. [02-retire-dead-editor-modules](02-retire-dead-editor-modules.md) — delete the orphaned `editorViewPreference.ts` + `SlotPresetChips.vue` (+ specs), purge dangling refs, verify grep-clean/type-check/lint/tests · _solo_

## Open questions
- **Meta-form placement:** Phase 1 keeps the title/description/timezone/closes form inside the sticky-left column above the calendar (form → calendar → action). If you'd prefer it full-width above the two-column grid, flag it before executing phase 1.
- **`slotPresets.ts`:** deleting `SlotPresetChips.vue` likely orphans `frontend/src/lib/slotPresets.ts`. The plan leaves it untouched (out of scope) — decide whether to also remove it.
- **Mobile action ordering:** the action is anchored under the calendar on lg+; on mobile it's reordered so the list is customizable before the action reads. Exact ordering is the executor's call.
