# Phase 2: Landing & Dashboard responsive pass

**Plan:** [responsive-foundations](00-overview.md)
**Depends on:** 01-foundations.md
**Execution:** solo

## Context
Pollendar is being made mobile-friendly via responsive-first foundations and CSS-only passes over existing screens — no DOM-switching, no backend changes. This phase tunes the two entry screens, `Landing.vue` (`/`) and `Dashboard.vue` (`/polls`), so they read well from a 375px phone up through desktop. Work is pure CSS via Tailwind v4 utilities (mobile-first base, then `sm:`/`md:`/`lg:`) and must reuse existing `@theme` tokens in `assets/main.css` — no new colors.

## Objective
Apply a mobile-first responsive CSS pass to `Landing.vue` and `Dashboard.vue` — heading scale, container/card padding, and grid column timing — without changing any markup structure or behavior.

## Files to touch
- `frontend/src/views/Landing.vue` — soften hero vertical rhythm and decorative-card padding on phones; keep the `lg:`-gated preview but ensure it scales cleanly; no XS heading change needed (already `text-4xl sm:text-5xl`).
- `frontend/src/views/Dashboard.vue` — add an XS heading step, tighten header gap/padding on phones, and verify the `sm:grid-cols-2 lg:grid-cols-3` card grid reads at 375px.

## Steps
1. `Landing.vue` line 26 — reduce phone vertical padding and gap on the hero `<section>`. Change `class="grid items-center gap-14 py-10 lg:grid-cols-2 lg:py-16"` to `class="grid items-center gap-10 py-8 sm:gap-14 sm:py-10 lg:grid-cols-2 lg:py-16"` so phones get tighter spacing and tablets/desktop keep the current rhythm.
2. `Landing.vue` line 31 — leave the `h1` heading scale as-is (`text-4xl sm:text-5xl` is already a correct mobile-first ramp); do not add a smaller XS step (text-4xl is legible at 375px and matches the established heading-scale pattern).
3. `Landing.vue` line 35 — the lede `<p class="mt-5 max-w-xl text-lg leading-relaxed text-dim">` is fine on mobile; no change. (Note for verification: confirm `max-w-xl` does not cause overflow at 375px — it is a max, so it clamps to the column.)
4. `Landing.vue` line 54 — keep the decorative preview `class="relative hidden lg:block"` exactly as-is (DOM-stable, hidden on mobile by design; full mobile-table behavior is out of scope and gated to a later phase). No change.
5. `Landing.vue` line 56 — standardize the decorative card padding to the project card pattern (`p-6 sm:p-8`, per `Card.vue` line 6). Change `class="rounded-2xl border border-line bg-surface p-6 shadow-card"` to `class="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8"`. (Card is `lg:`-visible only, but aligning padding keeps the audit consistent and harmless.)
6. `Dashboard.vue` line 28 — add an XS-aware heading scale. Change `class="font-display text-3xl font-semibold tracking-tight"` to `class="font-display text-2xl font-semibold tracking-tight sm:text-3xl"` so the title does not crowd the `New poll` action on a 375px phone (header is `flex-col` on phones, `sm:flex-row`, so the smaller base also helps the wrapped layout).
7. `Dashboard.vue` line 26 — tighten the header stack gap on phones. Change `class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"` to `class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4"` so the stacked title + button sit closer together on phones while keeping the current `sm:` spacing.
8. `Dashboard.vue` line 82 — leave the grid timing `class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"` as-is (base = 1 column on phones is correct mobile-first behavior); only verify at 375px that `PollCard` content does not overflow. No class change unless overflow is observed (if so, reduce to `gap-4 sm:gap-5`).
9. Confirm no other Landing/Dashboard utility uses a hardcoded color outside the existing `@theme` tokens (`pollen`, `canvas`, `surface`, `surface2`, `moonlight`, `mute`, `line`, `dim`, plus `coral`/`maybe`/`no` already present) — this phase introduces none.

## Verification
- `cd frontend && npm run build` (passes type-check + vite build)
- `cd frontend && npm run lint`
- Manual mobile-viewport check at 375px and 768px in devtools: Landing hero heading and lede do not overflow; `New poll` button on Dashboard does not collide with the title; Dashboard card grid is 1-col on phone, 2-col at `sm`, 3-col at `lg`.

## Acceptance
- [x] At 375px, the Dashboard `h1` renders at `text-2xl` and the `New poll` action stacks below it with no horizontal scroll.
- [x] At `sm` (640px) and above, the Dashboard `h1` is `text-3xl` and the header is a single `flex-row` with title left / action right (unchanged from before).
- [x] Landing hero uses tighter `gap-10 py-8` on phones and the original `gap-14`/`py-10`/`lg:py-16` rhythm at `sm`+; heading remains `text-4xl sm:text-5xl`.
- [x] No DOM/markup changes, no new color tokens, and `npm run build` + `npm run lint` both pass.
