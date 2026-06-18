# Phase 1: slot presets + SlotPresetChips

**Plan:** [2026-06-18-mobile-calendar-editor](00-overview.md)
**Depends on:** none
**Execution:** solo

## Context
The feature replaces the one-date-at-a-time candidate-times editor with a calendar multi-select + bulk-slot-apply flow behind a `Calendar | List` toggle, while emitting the **identical** `CreatePollPayload` (no backend change). The bulk-apply step needs a vocabulary of reusable time blocks (Morning / Afternoon / Evening / All day) plus a custom start–end. This phase delivers that vocabulary as a fixed app-wide constant and a presentational chip picker; nothing here is wired into `PollEditor.vue` yet — Phases 2–4 consume it. Both new files are net-new, not refactors.

## Objective
Add a fixed app-wide `slotPresets` constant (`lib/slotPresets.ts`) and a `SlotPresetChips` component that renders preset toggle-chips + a custom start/end and produces `PollSlotInput[]`.

## Files to touch
- `frontend/src/lib/slotPresets.ts` — **NEW.** Export a readonly `slotPresets` array of preset descriptors and a small helper that maps a preset id to a fresh `PollSlotInput`. Each preset carries `id`, `label`, and either `{ startTime, endTime, isAllDay: false }` or `{ isAllDay: true }`. No Vue imports — pure TS constants/helpers in the `lib/` convention.
- `frontend/src/components/SlotPresetChips.vue` — **NEW.** Controlled, presentational chip picker. Renders one toggle-chip per preset plus a "Custom" affordance with two `<input type="time">` fields. `v-model` carries the selected `PollSlotInput[]`; every change emits a full immutable array replacement (mirror `DateSlotEditor` / `SlotRow` ownership). Touch targets use the `.touch-target` utility (from the responsive-foundations plan) so chips are ≥44×44px on phone.
- `frontend/src/components/__tests__/SlotPresetChips.spec.ts` — **NEW.** vitest + `@vue/test-utils`, mirroring `DateSlotEditor.spec.ts` (`mount`, `.emitted('update:modelValue')`, `buttonByText` helper). Verifies that toggling a preset chip emits the matching `PollSlotInput`, toggling it off removes it, and the custom range emits `{ startTime, endTime, isAllDay: false }`.

## Steps
1. Create `frontend/src/lib/slotPresets.ts`. Define an exported `SlotPreset` interface — `{ id: string; label: string } & ({ isAllDay: false; startTime: string; endTime: string } | { isAllDay: true })` — and an exported `export const slotPresets = [...] as const satisfies readonly SlotPreset[]` with the **pinned** ranges (confirm against overview Open question before commit; default below):
   - `{ id: 'morning', label: 'Morning', isAllDay: false, startTime: '09:00', endTime: '12:00' }`
   - `{ id: 'afternoon', label: 'Afternoon', isAllDay: false, startTime: '12:00', endTime: '14:00' }`
   - `{ id: 'evening', label: 'Evening', isAllDay: false, startTime: '18:00', endTime: '21:00' }`
   - `{ id: 'all-day', label: 'All day', isAllDay: true }`
2. In the same file export a pure helper `presetToSlot(preset: SlotPreset): PollSlotInput` that returns a **fresh** object each call — `preset.isAllDay ? { isAllDay: true, label: preset.label } : { isAllDay: false, startTime: preset.startTime, endTime: preset.endTime, label: preset.label }`. Import the type via the alias: `import type { PollSlotInput } from '@/types/poll'`. Leave `sortOrder` **unset** (never assigned) so the payload-identity guarantee holds. Do **not** set `label` to `undefined`; set it to the preset's human label — `buildPayload()` (PollEditor.vue lines 81–84) maps `slot.label?.trim()`, so a real label round-trips and an empty one is omitted; this matches existing slot behavior.
3. Create `frontend/src/components/SlotPresetChips.vue`. `defineProps<{ modelValue: PollSlotInput[]; showErrors?: boolean }>()` and `defineEmits<{ 'update:modelValue': [PollSlotInput[]] }>()`. Import `slotPresets`, `presetToSlot`, and (for the custom row) keep all logic local. The component owns **no** array mutation in place: each handler emits a brand-new array (`emit('update:modelValue', next)`), exactly like `DateSlotEditor.updateDate/removeDate/addDate`.
4. Match a preset to the current model by **value**, not identity: a preset chip is "active" when `modelValue` already contains a slot equal to `presetToSlot(preset)` — compare on `isAllDay` + `startTime` + `endTime` (a small `slotMatchesPreset(slot, preset)` computed/helper). Clicking an inactive chip emits `[...modelValue, presetToSlot(preset)]`; clicking an active chip emits `modelValue.filter(s => !slotMatchesPreset(s, preset))`. This keeps `SlotPresetChips` a pure function of its `modelValue` prop.
5. Render the chips with the established chip/segmented pattern (`SlotRow` toggle, `Pill`): `inline-flex items-center gap-1.5`, `text-xs font-medium`, `rounded-lg`, and a computed `:class` switching `bg-yes text-canvas shadow-glow` (active) vs `border border-line text-dim hover:text-moonlight` (inactive). Add the `touch-target` class to each chip button. Use `<button type="button">` so the chips never submit the enclosing form.
6. Add the "Custom" range row: two `<input type="time">` fields styled with the `SlotRow` time-field classes (`field-sizing-content rounded-md border border-line bg-canvas px-2 py-1 text-center font-display text-sm text-moonlight focus:border-pollen focus:outline-none focus:ring-2 focus:ring-pollen/30`) and an "Add" button. On Add (both fields filled), emit `[...modelValue, { isAllDay: false, startTime, endTime, label: 'Custom' }]`. Drive the two inputs with local `ref`s, not the model, so a half-entered range never mutates `modelValue`.
7. Use `showErrors` only to reveal a hint when nothing is selected (`modelValue.length === 0`) — e.g. a `text-coral` line mirroring `DateCard`'s `noSlots` message. Do not add validation that diverges from `SlotRow` (a time-range slot still needs both ends).
8. Confirm the **payload-identity** chain stays intact: `SlotPresetChips` emits `PollSlotInput[]` only; it never builds `PollDateInput` or touches `dates[]`. A future parent (CalendarDateEditor / PollEditor, Phase 2–3) folds these slots into `PollDateInput.slots`, and `buildPayload()` in `PollEditor.vue` (lines 73–88) maps them unchanged. No preset path sets `sortOrder`, so the wire JSON is byte-identical to the list flow's. Nothing in this phase imports or edits `PollEditor.vue`, `pollStore`, or any DTO.
9. Create `frontend/src/components/__tests__/SlotPresetChips.spec.ts` following `DateSlotEditor.spec.ts`: a `mountChips(modelValue)` factory, a `lastModel(wrapper)` reader of `.emitted('update:modelValue')`, and a `buttonByText` helper. Cover: (a) clicking "Morning" emits `[{ isAllDay: false, startTime: '09:00', endTime: '12:00', label: 'Morning' }]`; (b) re-feeding that model and clicking "Morning" again emits `[]`; (c) clicking "All day" emits `[{ isAllDay: true, label: 'All day' }]`; (d) entering a custom start+end and clicking Add emits a `{ isAllDay: false, startTime, endTime }` slot. Import types via `@/types/poll`.
10. Reference `useBreakpoint()` only via import path if a phone-only style branch is needed — but **do not create** `frontend/src/composables/useBreakpoint.ts` (owned by the responsive-foundations plan); its documented contract is `{ isPhone, isTablet, isDesktop }`. Phase 1 should not hard-depend on it: chips work identically at every width, so prefer the `.touch-target` utility over a JS breakpoint here.

## Verification
- `cd frontend && npm run build && npm run lint`
- `cd frontend && npm run test:unit` (or the repo's vitest script) — the new `SlotPresetChips.spec.ts` is green.
- Manual UI check (deferred to Phase 3 integration, since the component is not yet mounted): on a phone-width viewport each chip is ≥44×44px (`.touch-target`), active chips show the `bg-yes shadow-glow` state, and the custom range adds a single time slot.

## Acceptance
- [ ] `frontend/src/lib/slotPresets.ts` exports `slotPresets` (Morning / Afternoon / Evening / All day, ranges pinned) and a `presetToSlot()` returning a fresh `PollSlotInput` with `sortOrder` unset.
- [ ] `frontend/src/components/SlotPresetChips.vue` is controlled (`v-model` of `PollSlotInput[]`), emits full immutable array replacements, and never mutates its prop in place.
- [ ] Each preset chip toggles one slot on/off by **value** match; the custom row emits a `{ startTime, endTime, isAllDay: false }` slot; "All day" emits `{ isAllDay: true }`.
- [ ] No file under `PollEditor.vue`, `pollStore`, DTOs, or the backend is touched; `useBreakpoint.ts` is not created.
- [ ] `npm run build` and `npm run lint` pass; `SlotPresetChips.spec.ts` passes.
