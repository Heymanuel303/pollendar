# Phase 3: Voter & Manage Chrome Responsive Pass

**Plan:** [responsive-foundations](00-overview.md)
**Depends on:** 01-foundations.md
**Execution:** workflow

## Context
Make Pollendar mobile-friendly via responsive-first foundations and CSS responsive passes over existing screens — no DOM-switching, no backend changes. Phase 1 established the foundations (`main.css` safe-area utilities/tokens, `useBreakpoint.ts`, App.vue/AppNav responsive shell). This phase applies a CSS-only responsive pass over the public voter flow (PublicPoll) and the creator manage chrome (PollManage, ShareBox, ResultsTable, BestSlotBloom) plus the shared tri-state/segmented toggles (AvailabilityToggle, SlotRow) so they reflow cleanly and hit 44px touch targets on phones.

## Objective
Reflow the voter form, manage header/sidebar, results/share/bloom blocks, and toggle controls to be mobile-first and touch-accessible using only existing `@theme` tokens and Tailwind v4 responsive prefixes.

## Files to touch
- `frontend/src/views/PublicPoll.vue` — replace hardcoded `pb-40` with safe-area-aware bottom padding; add `safe-area-inset-bottom` to the `fixed inset-x-0 bottom-0` sticky submit bar; tighten the About-you form and mobile horizontal padding.
- `frontend/src/views/PollManage.vue` — responsive header (heading scale + wrap), confirm `grid-cols-1 ... lg:grid-cols-3` sidebar reflow reads well at md, add safe-area/`px-4 sm:px-6` to the dialog modal.
- `frontend/src/components/ShareBox.vue` — confirm `flex-col gap-2 sm:flex-row` link row truncation; ensure copy button label wraps gracefully on narrow screens.
- `frontend/src/components/ResultsTable.vue` — reflow the desktop-only `grid grid-cols-12` rows to a stacked card layout on phones, then restore the 12-col split at `md+`.
- `frontend/src/components/BestSlotBloom.vue` — responsive padding (`p-4 sm:p-6 lg:p-8`) and title/score scaling at `md+`.
- `frontend/src/components/AvailabilityToggle.vue` — bump tri-state buttons to 44px touch targets and let the group go full-width on phones.
- `frontend/src/components/SlotRow.vue` — bump the All-day / Set-times segmented toggle (and other tap targets) to 44px.

## Steps
1. **PublicPoll — sticky footer safe-area + pb fix.** In `frontend/src/views/PublicPoll.vue`, on `<main class="mx-auto max-w-3xl px-6 pb-40 pt-10">` (line ~98) change `px-6` → `px-4 sm:px-6` and replace `pb-40` with the Phase-1 safe-area bottom-padding utility (e.g. `pb-44 pb-[calc(11rem+env(safe-area-inset-bottom))]` or the named utility added to `main.css` in Phase 1 — reuse it, do not invent a new token). On the sticky bar wrapper `<div class="fixed inset-x-0 bottom-0 z-20 border-t border-line/70 bg-canvas/85 backdrop-blur">` (line ~227) add bottom safe-area padding (`pb-[env(safe-area-inset-bottom)]` or the Phase-1 utility). On the inner bar `<div class="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">` (line ~230) change `px-6` → `px-4 sm:px-6`. Make the Submit `<button>` (line ~252) `w-full sm:w-auto` so it is full-width on phones; verify its `px-4 py-2.5` clears 44px (bump to `py-3` if needed).
2. **PublicPoll — About-you form + headings.** Keep the existing `grid gap-5 sm:grid-cols-2` (base stacked, sm+ two-up) for the About-you fields; ensure each text input is `min-h-11` (44px) — bump `py-1.5`/`py-3` inputs to `py-2.5` if under 44px. Keep `text-3xl sm:text-4xl` on the h1.
3. **PollManage — header + dialog.** In `frontend/src/views/PollManage.vue` header (line ~134), scale the title `<h1 class="font-display text-3xl font-semibold tracking-tight">` → `text-2xl sm:text-3xl`; the `flex flex-wrap items-center gap-3` already wraps the Pill — leave it. Body grid `grid grid-cols-1 gap-8 lg:grid-cols-3` (line ~167) stays as-is (mobile-first; sidebar reflows below the main `lg:col-span-2` column at `<lg`) — verify ShareBox sidebar reads at md width with no overflow. On the dialog modal `fixed inset-0 ... p-6` (line ~215), change `p-6` → `p-4 sm:p-6` and add `pb-[env(safe-area-inset-bottom)]` (or the Phase-1 utility) so it clears the notch.
4. **ShareBox — link row + button wrap.** In `frontend/src/components/ShareBox.vue`, the link row `mt-2 flex flex-col gap-2 sm:flex-row` (line ~36) is correct (stacked on phone, side-by-side at sm+). Keep `w-full min-w-0 flex-1 truncate` on the input. Ensure the `CopyButton` is full-width on phone (`w-full sm:w-auto` if the button does not already stretch) and its "Copy link" label does not overflow — add `whitespace-nowrap` if needed.
5. **ResultsTable — mobile card reflow.** In `frontend/src/components/ResultsTable.vue`, the row `<li class="grid grid-cols-12 items-center gap-3 px-4 py-4">` (line ~85) is desktop-only. Change to a stacked layout on phones, 12-col at `md+`: `flex flex-col gap-3 md:grid md:grid-cols-12 md:items-center`. On the three children: date block `col-span-5` → `md:col-span-5`; distribution block `col-span-5` → `md:col-span-5`; score block `col-span-2 text-right` → `md:col-span-2 md:text-right` (left-align the score on phones, e.g. `text-left`). Keep the `bloom-bg bloom ring-1 ring-pollen/40` winner styling untouched.
6. **BestSlotBloom — responsive padding + scale.** In `frontend/src/components/BestSlotBloom.vue`, on the card (line ~40) change `p-6` → `p-4 sm:p-6 lg:p-8`. Scale the score `font-display text-5xl ...` (line ~50) → `text-4xl sm:text-5xl`, and the date heading `<h3 class="font-display text-2xl ...">` (line ~56) → `text-2xl md:text-3xl`. Keep the `flex items-start justify-between gap-4` header.
7. **AvailabilityToggle — 44px tri-state.** In `frontend/src/components/AvailabilityToggle.vue`, the option buttons use `'rounded-lg px-3 py-1.5 transition focus:outline-none'` (line ~49, ~32px). Bump to `min-h-11` height and let the group fill width on phones: change the group wrapper (line ~41) `inline-flex` → `flex w-full sm:inline-flex sm:w-auto` and add `flex-1 sm:flex-none` to each button so the three options share the row evenly on phones; bump `py-1.5` → `py-2.5` (or add `min-h-11`). Preserve `aria-pressed` and active-class logic.
8. **SlotRow — 44px segmented toggle.** In `frontend/src/components/SlotRow.vue`, the All-day / Set-times buttons (lines ~78–95) use `px-2.5 py-1` (~28px). Bump to `px-3 py-2 min-h-11` (or `py-2.5`). Apply the same 44px floor to the row's other `<button>` (line ~121) and any time inputs (`min-h-11` / `py-2.5`).

## Execution strategy
- **Fan-out unit:** one agent per file/screen (the files are independent — distinct files in the shared tree).
- **Shape:** parallel barrier — each agent does one screen's responsive pass; barrier before verify.
- **Isolation:** none — agents edit distinct files; no worktree needed.
- **Verify stage:** after all agents finish, run `cd frontend && npm run build && npm run lint` once and confirm green.

## Verification
- `cd frontend && npm run build` (passes type-check + vite build)
- `cd frontend && npm run lint`
- Manual mobile-viewport check (~375px): PublicPoll sticky bar clears the safe area and never overlaps content; ResultsTable rows stack instead of overflowing; AvailabilityToggle/SlotRow toggles are at least 44px tall and tappable.

## Acceptance
- [ ] PublicPoll sticky submit bar uses safe-area-aware bottom padding (no hardcoded `pb-40` overlap) and the Submit button is full-width on phones.
- [ ] ResultsTable rows stack vertically below `md` and restore the 12-col grid at `md+` with no horizontal overflow at 375px.
- [ ] AvailabilityToggle tri-state buttons and SlotRow All-day/Set-times toggle are at least 44px tall on phones.
- [ ] BestSlotBloom padding and title/score scale across `sm`/`lg` using only existing `@theme` tokens.
- [ ] `cd frontend && npm run build` and `npm run lint` both pass; no new colors introduced.

IMPORTANT: Leave changes uncommitted; the user commits manually. Do NOT push or open a PR.
