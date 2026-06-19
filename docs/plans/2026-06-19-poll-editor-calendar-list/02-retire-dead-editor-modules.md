# Phase 2: Retire dead editor modules

**Plan:** [poll-editor-calendar-list](00-overview.md)
**Depends on:** [01-calendar-picker-and-split-layout.md](01-calendar-picker-and-split-layout.md)
**Execution:** solo

## Context
The feature redesigns `PollEditor.vue` so the candidate-times section is a pure calendar day-picker (no Calendar|List toggle, no bulk-preset panel) with an always-editable `DateSlotEditor` on the right and the Create/Save action anchored beneath the calendar. Phase 1 rewired the layout and dropped the live usages of the view-preference helper and the slot-preset chips, leaving `editorViewPreference.ts` and `SlotPresetChips.vue` (plus their specs) orphaned. This phase finishes the cleanup: it deletes those orphaned modules, removes any remaining dangling imports/type references, and proves the tree is grep-clean, type-checks, lints, and is test-green.

## Objective
Delete the orphaned `editorViewPreference.ts` and `SlotPresetChips.vue` (and their specs), purge every remaining import/type/usage of them, and verify the frontend tree is grep-clean and passes type-check, lint, and unit tests.

## Files to touch
- `frontend/src/lib/editorViewPreference.ts` — DELETE (orphaned helper: `EditorView` type, `getEditorView()`, `saveEditorView()`).
- `frontend/src/lib/__tests__/editorViewPreference.spec.ts` — DELETE (spec for the deleted helper).
- `frontend/src/components/SlotPresetChips.vue` — DELETE (orphaned presentational preset picker).
- `frontend/src/components/__tests__/SlotPresetChips.spec.ts` — DELETE (spec for the deleted component).
- `frontend/src/views/PollEditor.vue` — remove any residual `import { getEditorView, saveEditorView, type EditorView } from '@/lib/editorViewPreference'` (line 7) and the `editorView`/`watch` wiring that referenced them (lines 67-68) if phase 1 left a stub behind; confirm zero references remain.
- `frontend/src/components/CalendarDateEditor.vue` — remove any residual `import SlotPresetChips from '@/components/SlotPresetChips.vue'` (line 3) and the doc-comment mention of the `SlotPresetChips` bulk-apply panel (around line 9); confirm zero references remain.
- `frontend/src/views/__tests__/PollEditor.spec.ts` — remove the orphaned `KEY` const (line 23) and any localStorage-preference assertions left over from phase 1 that import the deleted helper.
- `frontend/src/components/__tests__/CalendarDateEditor.spec.ts` — remove any residual comment/test text referencing the deleted `SlotPresetChips` bulk-apply panel (e.g. line 119).

## Steps
1. Confirm phase 1 is in place: run `cd frontend && grep -rn "editorViewPreference\|SlotPresetChips\|getEditorView\|saveEditorView\|EditorView" src`. The only LIVE (non-deleted-file) hits should be the import lines that phase 1 may not have stripped — note each so it can be removed in step 4-5. Anything inside the four files being deleted is expected.
2. Delete the view-preference helper: remove `frontend/src/lib/editorViewPreference.ts` (exports `EditorView`, `getEditorView()`, `saveEditorView()`).
3. Delete its spec: remove `frontend/src/lib/__tests__/editorViewPreference.spec.ts` (imports `getEditorView`/`saveEditorView` from `../editorViewPreference`).
4. Delete the preset-chips component: remove `frontend/src/components/SlotPresetChips.vue` (presentational picker over `modelValue: PollSlotInput[]`, emits `update:modelValue`).
5. Delete its spec: remove `frontend/src/components/__tests__/SlotPresetChips.spec.ts` (imports `SlotPresetChips` from `../SlotPresetChips.vue`).
6. In `frontend/src/views/PollEditor.vue`: ensure the `import { getEditorView, saveEditorView, type EditorView } from '@/lib/editorViewPreference'` (line 7) is gone. If phase 1 left the `editorView` ref still typed as `EditorView` or still calling `getEditorView()`/`saveEditorView()` (lines 67-68 area), retype the ref to a local literal union (e.g. `ref<'calendar' | 'list'>('list')` or inline the type) so it no longer depends on the deleted module, and drop the `watch(editorView, ...)` persistence line. Do NOT remove the toggle markup itself if phase 1 kept it — only sever the dependency on the deleted module.
7. In `frontend/src/components/CalendarDateEditor.vue`: ensure the `import SlotPresetChips from '@/components/SlotPresetChips.vue'` (line 3) is gone and the bulk-apply panel markup (the `<SlotPresetChips v-model="activeSlots" .../>` around line 206) was removed by phase 1. Update the component doc-comment (around line 9) that still references the `SlotPresetChips` bulk-apply panel so the docstring matches the new "tap-a-day stamps a fixed default slot" behavior.
8. In `frontend/src/views/__tests__/PollEditor.spec.ts`: delete the orphaned `KEY` const (line 23, the `'pollendar:editor-view'` localStorage key) and remove any leftover assertion or `import` that still references `editorViewPreference`/`getEditorView`/`saveEditorView`. Leave the `stubMatchMedia` setup intact (other breakpoint tests still use it).
9. In `frontend/src/components/__tests__/CalendarDateEditor.spec.ts`: remove any residual comment or test text mentioning the deleted `SlotPresetChips` bulk-apply panel (e.g. the comment at line 119) so no dangling reference remains. Do not re-add preset-apply behavior tests — those were retired in phase 1.
10. Re-run the grep from step 1 and confirm ZERO matches remain anywhere under `frontend/src` (the four target files are gone and all imports/types/comments are cleaned). `slotPresets.ts` is intentionally left in place per scope — do not delete it.
11. Run type-check, lint (with `--fix`), and the unit suite; fix any newly-surfaced dangling reference the grep missed.

## Verification
- `cd frontend && grep -rn "editorViewPreference\|SlotPresetChips\|getEditorView\|saveEditorView\|EditorView" src` → returns NOTHING (grep-clean tree).
- `cd frontend && npm run type-check` → passes (no unresolved imports / missing `EditorView` type / missing `SlotPresetChips` component).
- `cd frontend && npm run lint` → passes (no unused-import or unresolved-module errors).
- `cd frontend && npx vitest run` → all suites green; the deleted specs (`editorViewPreference.spec.ts`, `SlotPresetChips.spec.ts`) no longer run and no remaining spec imports the deleted modules.
- Manual (optional): `cd frontend && npm run dev`, open `/polls/new` and `/polls/:id/edit` and confirm the editor still renders (no console import errors), tapping a day still adds it with the fixed default slot `{ startTime: '18:00', endTime: '20:00', isAllDay: false }`, and edit-mode vote-locked days/slots stay locked.

## Acceptance
- [ ] `frontend/src/lib/editorViewPreference.ts`, `frontend/src/lib/__tests__/editorViewPreference.spec.ts`, `frontend/src/components/SlotPresetChips.vue`, and `frontend/src/components/__tests__/SlotPresetChips.spec.ts` no longer exist.
- [ ] `grep -rn "editorViewPreference\|SlotPresetChips\|getEditorView\|saveEditorView\|EditorView" frontend/src` returns no matches.
- [ ] `npm run type-check`, `npm run lint`, and `npx vitest run` all pass from `frontend/`.
- [ ] `frontend/src/lib/slotPresets.ts` remains untouched (out of scope), and payloads / edit-mode vote-lock behavior are unchanged (no code path that builds `CreatePollPayload`/`UpdatePollPayload` was edited).
