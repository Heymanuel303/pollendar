# Phase 1: Foundations

**Plan:** [responsive-foundations](00-overview.md)
**Depends on:** none
**Execution:** solo

## Context
Pollendar must become mobile-friendly via responsive-first foundations and CSS responsive passes over existing screens (no DOM-switching, no backend changes). This phase lays the shared groundwork the later screen passes depend on: a breakpoint composable, reusable CSS utilities for safe-area / touch targets / footer clearance, a responsive nav shell, and tighter mobile container padding. All work is in `frontend/` only, reusing existing `@theme` tokens — no new colors.

## Objective
Add the `useBreakpoint` composable, the `.pb-with-footer` / safe-area / touch-target utilities in `main.css`, a responsive `AppNav` shell, and mobile-tight container padding in `App.vue`.

## Files to touch
- `frontend/src/composables/useBreakpoint.ts` — NEW file; `matchMedia`-backed reactive breakpoint composable (first entry in a new `composables/` dir).
- `frontend/src/assets/main.css` — add `@utility` rules for `.touch-target`, `.safe-bottom`, `.safe-top`, `.pb-with-footer`, and an `env(safe-area-inset-*)` body padding baseline.
- `frontend/src/components/layout/AppNav.vue` — align container width with the app shell and tighten mobile padding.
- `frontend/src/App.vue` — make the `<main>` container padding mobile-first (`px-4 sm:px-6`) and apply safe-area awareness.

## Steps
1. Create `frontend/src/composables/useBreakpoint.ts`. Export a `useBreakpoint()` composable using the Vue 3.5 composition API (`import { ref, computed, onMounted, onUnmounted } from 'vue'`). Internally create one `window.matchMedia` query per Tailwind v4 breakpoint — `sm` `(min-width: 640px)`, `md` `(min-width: 768px)`, `lg` `(min-width: 1024px)` — store each match in a `ref<boolean>`, register `addEventListener('change', …)` listeners in `onMounted`, and clean them up in `onUnmounted`. Initialize refs from `.matches` (guard `typeof window !== 'undefined'` for SSR/build safety). Keep the raw `sm`/`md`/`lg` matchMedia refs as INTERNAL implementation detail and return only the public refs `{ isPhone, isTablet, isDesktop }`, derived as `isPhone = computed(() => !sm.value)` (true below `sm` — the phone breakpoint), `isTablet = computed(() => sm.value && !lg.value)`, and `isDesktop = computed(() => lg.value)`. Keep it dependency-free and pure (no Pinia, no router).
2. In `frontend/src/assets/main.css`, after the existing `@utility num { … }` block (currently ends ~line 99), add new `@utility` rules (Tailwind v4 CSS-first — utilities go here, NOT in a config file):
   - `@utility touch-target { min-height: 2.75rem; min-width: 2.75rem; }` (44×44px minimum tap zone for the later `AvailabilityToggle` / `SlotRow` / `PollSlotRow` passes).
   - `@utility safe-bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }`
   - `@utility safe-top { padding-top: env(safe-area-inset-top, 0px); }`
   - `@utility pb-with-footer { padding-bottom: calc(8rem + env(safe-area-inset-bottom, 0px)); }` — replaces the hardcoded `pb-40` clearance under `PublicPoll.vue`'s fixed sticky footer (consumed in a later phase) and accounts for the notch.
3. In `frontend/src/assets/main.css`, ensure notched-device awareness for fixed bars: add a small comment documenting that fixed bottom bars should compose `safe-bottom`, and confirm `:root { color-scheme: dark; }` stays unchanged. Do NOT add new color tokens.
4. In `frontend/src/components/layout/AppNav.vue`, change the `<nav>` container class from `mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5` to `mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6` so the nav aligns with the `max-w-6xl` app shell in `App.vue` and uses tighter mobile horizontal padding. Keep the `sticky top-0 z-10 border-b border-line bg-surface/70 backdrop-blur` header wrapper as-is.
5. In `frontend/src/App.vue`, change the `<main>` class from `mx-auto max-w-6xl px-6 py-8` to `mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8` (mobile-first: phone base, then `sm:` desktop spacing). Leave the public-route branch (`<RouterView v-if="isPublic" />`) and the `bg-dusk min-h-screen text-moonlight` wrapper untouched.
6. Do not consume `useBreakpoint` in any view this phase — it is foundation only; later screen-pass phases import it via `@/composables/useBreakpoint`.

## Verification
- `cd frontend && npm run build` (passes type-check + vite build)
- `cd frontend && npm run lint`
- Manual mobile-viewport check (DevTools 375px width): `AppNav` and `<main>` share the same left/right edge alignment, nav padding is tighter on phone and expands at `sm`, and no horizontal scrollbar appears on the shell.

## Acceptance
- [x] `frontend/src/composables/useBreakpoint.ts` exists, exports `useBreakpoint()` returning reactive `{ isPhone, isTablet, isDesktop }`, and the project builds with it imported nowhere yet (tree-shake-safe).
- [x] `main.css` defines `.touch-target`, `.safe-bottom`, `.safe-top`, and `.pb-with-footer` as `@utility` rules; `npm run build` emits them as usable Tailwind utilities.
- [x] `AppNav.vue` uses `max-w-6xl` with `px-4 sm:px-6`, matching the `App.vue` shell width.
- [x] `App.vue` `<main>` uses `px-4 py-6 sm:px-6 sm:py-8`; both `npm run build` and `npm run lint` pass with changes left uncommitted.
