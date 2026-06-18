# Responsive Foundations + Responsive Passes

**Slug:** `responsive-foundations` (folder: `docs/plans/2026-06-18-responsive-foundations/`)
**Created:** 2026-06-18
**Status:** in-progress

## Goal
Make Pollendar mobile-friendly with a responsive-first single codebase: ship the shared foundations (a `useBreakpoint` composable, safe-area / touch-target / sticky-footer utilities, and a responsive `AppNav` shell), then apply pure-CSS mobile-first responsive passes to the existing screens. No DOM-switching, no backend changes — source: `docs/design/2026-06-18-mobile-friendly-overview.md` (Mobile strategy + workstreams 1–3).

## Scope
- `frontend/src/composables/useBreakpoint.ts` (new): reactive `isPhone`/`isTablet`/`isDesktop` over Tailwind v4 token breakpoints.
- `frontend/src/assets/main.css`: `@utility` rules for touch targets, safe-area insets, `.pb-with-footer`.
- `frontend/src/App.vue` + `frontend/src/components/layout/AppNav.vue`: responsive shell + safe-area + tighter mobile padding.
- `frontend/src/views/Landing.vue`, `Dashboard.vue`: mobile-first CSS pass.
- `frontend/src/views/PublicPoll.vue`, `PollManage.vue` + `ShareBox.vue`, `ResultsTable.vue`, `BestSlotBloom.vue`, `AvailabilityToggle.vue`, `SlotRow.vue`: voter form + manage chrome pass, 44px touch targets, safe-area footer fix.

## Out of scope
- Backend / API changes (the "who voted" endpoint is a separate workstream).
- Adaptive DOM-switching surfaces: the calendar editor (Redesign A) and participant matrix (Redesign B).
- New HTML mockups for the two novel surfaces.
- New design tokens / colors — reuse the existing `@theme` set unchanged.

## Constraints
- Frontend-only; no backend tests, no e2e.
- Mobile-first Tailwind v4 cascade (base = phone, then `sm`/`md`/`lg`); CSS-first `@theme`, no `tailwind.config.js`.
- Verification for every phase is exactly: `cd frontend && npm run build && npm run lint`.
- Changes left uncommitted; the user commits manually.

## Acceptance criteria
- [ ] `useBreakpoint` composable exists and is SSR-safe with listener cleanup.
- [ ] `main.css` exposes touch-target, safe-area (top/bottom), and `.pb-with-footer` utilities.
- [ ] `AppNav` has safe-area-top and a sensible phone layout; container padding tightened on mobile.
- [ ] Landing + Dashboard render cleanly at 320–375px with no overflow and no color/DOM changes.
- [ ] `PublicPoll` sticky footer respects `env(safe-area-inset-bottom)` (no hardcoded `pb-40`); all interactive controls (toggle, vote, remove) meet 44×44px.
- [ ] `cd frontend && npm run build && npm run lint` is green after each phase.

## Phases
1. [01-foundations](01-foundations.md) — `useBreakpoint` composable + safe-area/touch-target/`.pb-with-footer` utilities + responsive `AppNav` + tighter mobile shell padding · _solo_ ✓
2. [02-landing-dashboard](02-landing-dashboard.md) — pure-CSS mobile-first pass over `Landing.vue` and `Dashboard.vue` (heading scale, padding, `md:` grids) · _solo_ ✓
3. [03-voter-manage-chrome](03-voter-manage-chrome.md) — voter form + manage chrome pass: safe-area footer fix, About-you form, `PollManage` chrome, `ShareBox`, `ResultsTable`, `BestSlotBloom`, `AvailabilityToggle`/`SlotRow` touch targets · _workflow_

## Open questions
- None for this plan. Deferred items (calendar editor, participant matrix, "who voted" backend endpoint, mockups, view-toggle persistence) are tracked in the source overview's workstreams 4–7.
