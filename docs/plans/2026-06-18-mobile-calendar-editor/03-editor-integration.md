# Phase 3: Calendar | List toggle integration in PollEditor

**Plan:** [2026-06-18-mobile-calendar-editor](00-overview.md)
**Depends on:** 02-calendar-date-editor.md
**Execution:** solo

## Context
We are replacing the one-date-at-a-time candidate-times editor with a calendar multi-select + bulk-slot-apply flow on mobile and desktop, behind a `Calendar | List` toggle, while emitting the identical `CreatePollPayload` (no backend change). Phases 01–02 produced the leaf pieces: `slotPresets` + `SlotPresetChips.vue` (chips that seed slots) and `CalendarDateEditor.vue` (a controlled month-grid multi-select + bulk-apply editor that, like `DateSlotEditor.vue`, is a pure function of its `PollDateInput[]` `modelValue` and emits immutable `update:modelValue` replacements). This phase wires those into `PollEditor.vue`: a segmented `Calendar | List` toggle that swaps the two editor views over the **same** `dates` ref, with the existing `DateSlotEditor` (and its nested `DateCard`/`SlotRow`) serving as the List view + per-date override surface, and the chosen view persisted in `localStorage`.

## Objective
Wire a Calendar|List segmented toggle into PollEditor.vue over the SHARED dates ref so both views mutate the same array; reuse DateSlotEditor for the List view and DateCard/SlotRow for per-date override; persist the toggle choice in localStorage.

## Files to touch
- `frontend/src/views/PollEditor.vue` — import `CalendarDateEditor` (from phase 02) and `useBreakpoint` (from responsive-foundations); add an `editorView` ref (`'calendar' | 'list'`) seeded from a new localStorage helper; render a `Calendar | List` segmented toggle in the candidate-times region; `v-if`/`v-else`-swap `CalendarDateEditor` and `DateSlotEditor`, both `v-model`-bound to the **same** `dates` ref; default the initial view to Calendar on phone (`isPhone`) when no stored preference exists. `buildPayload()` (lines 73–88), `isValid()` (lines 63–71), the `dates` ref (lines 29–34), and `submit()` (lines 90–101) are **unchanged**.
- `frontend/src/lib/editorViewPreference.ts` — NEW file; a tiny `getEditorView()` / `saveEditorView()` pair wrapping `localStorage` in try/catch (mirrors `frontend/src/lib/participantToken.ts`), keyed `pollendar:editor-view`, returning `'calendar' | 'list' | null`.

## Steps
1. **Add the localStorage helper.** Create `frontend/src/lib/editorViewPreference.ts` modeled on `frontend/src/lib/participantToken.ts`:
   - `export type EditorView = 'calendar' | 'list'`
   - `const KEY = 'pollendar:editor-view'`
   - `export function getEditorView(): EditorView | null` — `try { const v = localStorage.getItem(KEY); return v === 'calendar' || v === 'list' ? v : null } catch { return null }`. The strict `=== 'calendar' || === 'list'` guard means any stale/garbage value falls back to `null` (caller picks the breakpoint default), so no invalid state can reach the template.
   - `export function saveEditorView(view: EditorView): void` — `try { localStorage.setItem(KEY, view) } catch { /* storage disabled — preference just isn't remembered */ }`
   - Every access is wrapped in try/catch for private-mode / storage-disabled safety, exactly like `saveParticipantToken`/`getParticipantToken`.
2. **Import the new pieces in `PollEditor.vue`.** In the `<script setup>` block (top of file, alongside the existing `import DateSlotEditor from '@/components/DateSlotEditor.vue'` at line 4), add:
   - `import CalendarDateEditor from '@/components/CalendarDateEditor.vue'` (the phase-02 component)
   - `import { useBreakpoint } from '@/composables/useBreakpoint'` (responsive-foundations contract: returns `{ isPhone, isTablet, isDesktop }` where `isPhone` is a `computed(() => !sm.value)` over the internal `sm` matchMedia ref; matchMedia listeners self-register in `onMounted`/`onUnmounted`)
   - `import { getEditorView, saveEditorView, type EditorView } from '@/lib/editorViewPreference'`
   - Keep `computed` and `ref` already imported from `vue` (line 2); add `watch` to that import (`import { computed, ref, watch } from 'vue'`).
3. **Add the view-selection state.** Below the existing `dates` ref (after line 34), add:
   - `const { isPhone } = useBreakpoint()`
   - `const editorView = ref<EditorView>(getEditorView() ?? (isPhone.value ? 'calendar' : 'list'))` — stored preference wins; otherwise default Calendar on phone, List on desktop. (Reading `isPhone.value` once at setup is sufficient — the user can still toggle; we do not want to clobber an explicit choice on a later resize.)
   - `watch(editorView, (view) => saveEditorView(view))` — persist on every change.
   - Do NOT add a second `dates` ref and do NOT clone `dates`: both editors bind the one ref so the array never diverges (this is the load-bearing invariant for the payload guarantee).
4. **Render the segmented toggle.** In the template, replace the single `<DateSlotEditor v-model="dates" :timezone="timezone" :show-errors="submitted" />` at line 160 with a wrapper that holds the toggle header + the swapped editor. Mirror the `inline-flex rounded-lg border border-line bg-canvas p-0.5 text-xs font-medium` segmented-toggle pattern from `SlotRow.vue` lines 77–100 (active = `rounded-md bg-yes px-2.5 py-1 text-canvas shadow-glow`, inactive = `rounded-md px-2.5 py-1 text-dim transition hover:text-moonlight`):
   ```vue
   <div>
     <div class="mb-3 flex justify-end">
       <div class="inline-flex rounded-lg border border-line bg-canvas p-0.5 text-xs font-medium" role="group" aria-label="Editor view">
         <button
           type="button"
           :class="editorView === 'calendar' ? 'rounded-md bg-yes px-2.5 py-1 text-canvas shadow-glow' : 'rounded-md px-2.5 py-1 text-dim transition hover:text-moonlight'"
           :aria-pressed="editorView === 'calendar'"
           @click="editorView = 'calendar'"
         >Calendar</button>
         <button
           type="button"
           :class="editorView === 'list' ? 'rounded-md bg-yes px-2.5 py-1 text-canvas shadow-glow' : 'rounded-md px-2.5 py-1 text-dim transition hover:text-moonlight'"
           :aria-pressed="editorView === 'list'"
           @click="editorView = 'list'"
         >List</button>
       </div>
     </div>

     <CalendarDateEditor
       v-if="editorView === 'calendar'"
       v-model="dates"
       :timezone="timezone"
       :show-errors="submitted"
     />
     <DateSlotEditor
       v-else
       v-model="dates"
       :timezone="timezone"
       :show-errors="submitted"
     />
   </div>
   ```
   Both editors receive the identical prop trio (`v-model="dates"`, `:timezone="timezone"`, `:show-errors="submitted"`) — `CalendarDateEditor`'s contract (phase 02) matches `DateSlotEditor`'s controlled `modelValue: PollDateInput[]` / `update:modelValue` / `timezone` / `showErrors` interface, so swapping them is transparent to the parent.
5. **Confirm the payload mapping is untouched.** Do not edit `buildPayload()` (lines 73–88), `isValid()` (lines 63–71), `submit()` (lines 90–101), or `previewRows` (lines 51–61). Because both views mutate the single `dates` ref of `PollDateInput[]`, and `buildPayload()` maps `dates.value -> CreatePollPayload.dates` with the exact same per-date/per-slot projection regardless of which view produced the array:
   - per date: `{ eventDate, slots: [...] }` (no `sortOrder` — drag-reorder is out of scope, so `sortOrder` stays `undefined` and is omitted from the JSON, preserving byte-identity)
   - per slot all-day: `{ label?, isAllDay: true }`
   - per slot timed: `{ label?, isAllDay: false, startTime, endTime }`
   the emitted `CreatePollPayload` is identical whether the dates came from the Calendar or List view. `pollStore.create(buildPayload())` (line 94) and the `closesAt` PATCH-only TODO (lines 95–96) stay exactly as-is.
6. **Avoid double-seeding on toggle.** Toggling is a pure view swap over the same already-seeded `dates` array — neither `v-if` branch re-seeds. Verify the new components do NOT auto-seed in `onMounted`: the parent owns the seed (the initial `[{ eventDate: nextCandidateDate(), slots: [{ startTime: '18:00', endTime: '20:00', isAllDay: false }] }]` at lines 29–34), and `DateSlotEditor.addDate` / `DateCard.addSlot` only append on explicit user action (`{ startTime: '18:00', endTime: '20:00', isAllDay: false }` seed at `DateSlotEditor.vue` line 46 / `DateCard.vue` line 39). `CalendarDateEditor` (phase 02) must likewise add dates only on grid selection, never on mount — if phase 02 was implemented otherwise, flag it rather than work around it here.
7. **Per-date override path stays intact.** The List view is the per-date/per-slot override surface: `DateSlotEditor` → `DateCard` → `SlotRow` already provide label / All-day↔Set-times toggle / start–end editing via controlled `update:modelValue` emits. No change needed beyond rendering `DateSlotEditor` in the `v-else` branch; users switch to List to fine-tune any individual date the Calendar bulk-apply produced.

## Verification
- `cd frontend && npm run build` (type-check + vite build must pass)
- `cd frontend && npm run lint`
- Manual UI check at 375px width (DevTools): with no stored preference the editor opens on **Calendar**; the `Calendar | List` toggle swaps views with no loss of selected dates/slots; switching Calendar→List shows the same dates as `DateCard`s and lets you edit a single slot's times; reloading the page restores the last-chosen view (and silently no-ops the preference in a storage-disabled / private context).
- Sanity-check payload identity: build a poll via Calendar, note the dates; switch to List (same dates appear), click **Create poll** — the POST body is the same `CreatePollPayload` you'd get from the pure-List flow (no `sortOrder`, no `closesAt`).

## Acceptance
- [ ] `frontend/src/lib/editorViewPreference.ts` exists, wraps `localStorage` in try/catch (key `pollendar:editor-view`), and returns `'calendar' | 'list' | null`.
- [ ] `PollEditor.vue` renders a `Calendar | List` segmented toggle; `CalendarDateEditor` and `DateSlotEditor` are mutually exclusive (`v-if`/`v-else`) and both `v-model`-bound to the one `dates` ref.
- [ ] Default view is Calendar on phone (`isPhone`) and List on desktop when no preference is stored; an explicit choice persists across reloads.
- [ ] Toggling views never re-seeds or drops dates/slots (the single `dates` ref is shared, not cloned).
- [ ] Per-date override still works through the reused `DateCard`/`SlotRow` in the List view.
- [ ] `buildPayload()`, `isValid()`, `submit()`, and `pollStore.create()` are unchanged; the emitted `CreatePollPayload` is identical regardless of which view authored `dates` (no `sortOrder`, no `closesAt`).
- [ ] `cd frontend && npm run build` and `npm run lint` are green with the tree left uncommitted.
