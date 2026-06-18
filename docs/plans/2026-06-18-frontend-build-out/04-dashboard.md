# Phase 4: Dashboard — creator poll list

**Plan:** [frontend-build-out](00-overview.md)
**Depends on:** 03-poll-editor.md
**Execution:** solo

## Context
We are building the real Pollendar frontend — a Vue 3.5 + Vite + TypeScript SPA implementing
every route in DESIGN.md §8, styled to the "Dusk Calendar" dark theme (deep-violet dusk lit by
warm pollen gold) defined in `docs/design/DESIGN-UI.md`. Styling is Tailwind v4 **CSS-first**:
all tokens live in the `@theme {}` block of `frontend/src/assets/main.css` (no `tailwind.config.js`,
no PostCSS, no v3 `@tailwind` directives), and the motif helpers `.bg-dusk` / `.pollen-dot` /
`.bloom` / `.bloom-bg` are small custom classes in that same file (scaffolded in phase 1). This
phase is the authenticated creator's home screen: it lists the polls they own. It depends on the
poll editor (phase 3) only for the `/polls/new` route target and the shared `pollStore` it
introduces; everything else (router, api client, layout header) comes from phases 1–2.

## Objective
Build the `Dashboard` view that fetches the creator's polls via `pollStore.list()` and renders
them as a responsive grid of `PollCard` components (open vs completed states), with a loading
state, an `EmptyState` for zero polls, and a "New poll" entry point routing to `/polls/new`.

## Files to touch
- `frontend/src/stores/pollStore.ts` — add (or extend) a Pinia store with `polls` state, a
  `loading`/`error` flag, and a `list()` action that calls `GET /api/polls` through the shared api
  client (`credentials:"include"`). This phase owns the **list** slice; phase 3 may already have
  created the store for create/edit — extend it, do not duplicate. Define the `Poll` and
  derived-summary TypeScript types here (all ids typed `string`).
- `frontend/src/views/Dashboard.vue` — thin view: page header ("Your polls" + tagline + "New poll"
  button), calls `pollStore.list()` on mount, renders loading / empty / grid states. No fetch logic
  or formatting beyond composing components.
- `frontend/src/components/PollCard.vue` — presentational card for a single poll; `Poll` prop in,
  router-link/emit out. Renders open vs completed variants per the mockup.
- `frontend/src/components/EmptyState.vue` — reusable dashed-border empty panel (icon slot + title
  + body + CTA). Generic enough to reuse on other empty screens.
- `frontend/src/lib/datetime.ts` — **only if phase 1/2 has not already created it**: a shared
  `Intl.DateTimeFormat` helper that formats a date in an explicit IANA `timeZone`. Reuse the
  existing util if present; do not add a second one.
- `frontend/src/router/index.ts` — confirm the `/dashboard` route maps to `Dashboard.vue` (added in
  phase 1); add it only if missing. Do not duplicate the route.

## Steps
1. **Store — types.** In `pollStore.ts`, declare a `Poll` interface matching the raw shape returned
   by `GET /api/polls` (backend `PollsService.findAllForUser` → `prisma.poll.findMany({ where:{userId}, orderBy:{createdAt:'desc'} })`):
   `id: string`, `userId: string`, `publicToken: string`, `title: string`, `description: string | null`,
   `timezone: string` (IANA), `status: 'open' | 'completed' | 'cancelled'`, `finalSlotId: string | null`,
   `closesAt: string | null`, `completedAt: string | null`, `createdAt: string`, `updatedAt: string`.
   **Every id is a `string`** (the global `BigIntSerializerInterceptor` stringifies BigInt ids).
   Note: this endpoint returns **raw poll rows only** — NO nested `dates`, NO `_count`, NO response
   count, NO date range (confirmed in `polls.service.ts`).
2. **Store — `list()` action.** Add `polls: Poll[]`, `loading: boolean`, `error: string | null`
   state and a `list()` action that sets `loading`, calls the shared api client
   (`api.get<Poll[]>('/polls')` — base path `/api`, `credentials:"include"`), assigns the result to
   `polls`, clears/sets `error`, and unsets `loading` in a `finally`. On 401, let the api client's
   interceptor redirect to `/` (auth handled in phase 2) — do not special-case it here. The list is
   already `createdAt desc` from the backend, so **do not re-sort**.
3. **Decide the response-count / date-range source (IMPORTANT — gotcha).** The PollCard mockup shows
   a response count, a pollen-dot grain proportional to it, and a `Jun 26–28` date range. The list
   endpoint provides **none** of these. For this phase, render the card from the fields that DO
   exist and degrade the rest gracefully:
   - Response count: render the count **only if** the `Poll` object carries one. Read it defensively
     as `poll.responseCount ?? poll._count?.participants ?? null`; type these as optional on `Poll`.
     When `null`, omit the count line and the grain dots entirely (no "0 responses" placeholder, no
     fixed 5 grains). Add a `// TODO(phase-hardening): backend GET /polls should include
     _count.participants + date range; see 99-hardening` comment in the store next to the type so the
     gap is tracked, **but do not modify backend code in this phase.**
   - Date range: render a range **only if** `poll.dates` is present (it is not, today). Compute it as
     `min(eventDate)`–`max(eventDate)` formatted via the shared `Intl.DateTimeFormat` helper using
     `poll.timezone` (NOT the browser zone). When `dates` is absent, omit the range and show the
     timezone line on its own. Do not invent a range from `createdAt`.
   This keeps the card honest with the real API while matching the mockup whenever the data is
   present (so it "just works" once hardening adds `_count`/`dates`).
4. **`PollCard.vue` — props & routing.** Props: `poll: Poll`. Emit `share` (carry `poll`) for the
   "Share" affordance; the parent (or a later phase) opens the share box / fetches
   `GET /api/polls/:id/invite-message`. Primary action routes by status:
   - **open** → primary "Manage" button → `RouterLink`/`router.push` to `/polls/${poll.id}`
     (PollManage view, phase 5).
   - **completed** → "View results" button → same `/polls/${poll.id}` target.
   Use `poll.id` (a string) directly in the path. The "⋯" more-options button can be a stub that
   emits `more` (full menu is out of scope for this phase).
5. **`PollCard.vue` — open variant (port `mockups/components/poll-card.html` VARIANT 1).** Card:
   `rounded-2xl border border-line bg-surface p-6 shadow-card`, hover `hover:border-pollen/40
   hover:bg-surface2 hover:shadow-glow hover:-translate-y-1 transition`. Header row: `<h3>` title in
   `font-display text-lg font-semibold`, and a status badge `rounded-full bg-pollen/15 px-2.5 py-1
   text-xs font-medium text-pollen ring-1 ring-pollen/30` reading **"Open"**. Below the title, a
   meta line: optional date range in `font-display` + `· {poll.timezone}` in `text-mute` micro.
   Response-count line (only when count present): a `flex` of N `.pollen-dot` spans
   (`inline-block h-2.5 w-2.5`, `aria-hidden="true"`) where **N = the actual count** (proportional,
   not a fixed 5), followed by `<span class="num font-medium text-moonlight">{count}</span>
   responses`. Wrap the count numeral in `.num` (the Space-Grotesk numeral utility from
   DESIGN-UI.md). Actions row: primary "Manage" (`bg-pollen text-canvas shadow-glow`), secondary
   "Share" (`border border-line bg-surface`), tertiary "⋯" (ghost).
6. **`PollCard.vue` — completed variant (port VARIANT 2).** Same shell but hover border `mint/40`;
   badge `bg-mint/15 text-mint ring-mint/30` reading **"Completed"**. Meta line shows
   `font-display "Final time locked" · {poll.timezone}`. If a formatted final-slot string is
   available on the poll, render the blooming final-slot panel: `bloom bloom-bg ... border
   border-pollen/40` with the time in `font-display .num` and a `✦ In bloom` chip; otherwise omit
   the panel (the final slot's formatted time is NOT in the list payload — `finalSlotId` is only an
   id; resolving it is out of phase-4 scope, so guard on its presence). Primary action is
   "View results". Do not render `cancelled` polls with a bespoke state — the mockups only cover
   open/completed; if a `cancelled` poll appears, fall through to the open-style shell with a
   neutral `text-mute` "Closed" badge (no crash).
7. **`EmptyState.vue` (port the dashboard empty-state hint).** Reusable panel:
   `rounded-2xl border border-dashed border-line bg-surface/40 p-6 text-center flex flex-col
   items-center`. Slots/props: an icon (default the `＋` glyph in a `grid h-11 w-11 place-items-center
   rounded-2xl bg-surface2 text-pollen ring-1 ring-line`), a `title` prop ("New polls show up here",
   `font-display font-semibold text-moonlight`), a `body` prop ("Start one and gather everyone's
   availability. Takes about a minute."), and a CTA slot/prop ("Create a poll", ghost button) that
   routes to `/polls/new`. Keep it generic (title/body/cta via props or slots) so other empty
   screens can reuse it.
8. **`Dashboard.vue` — header.** Top of `<main class="mx-auto max-w-6xl px-6 py-10">`: a flex header
   with `<h1 class="font-display text-3xl font-semibold tracking-tight">Your polls</h1>`, the tagline
   `<p class="text-dim">Find the time everyone can make — track every gathering in one place.</p>`
   (canonical tagline from DESIGN-UI.md), and a primary "New poll" button (`bg-pollen text-canvas
   shadow-glow`, `＋` glyph) that is a `RouterLink` to `/polls/new`. Assume the global app header
   (brand mark + nav + avatar) is a layout component from phase 1 — **not** this view's job; do not
   re-implement it here.
9. **`Dashboard.vue` — body states.** `onMounted` (or `<script setup>` top-level await guarded) calls
   `pollStore.list()`. Render three states from store refs (use `storeToRefs`):
   (a) `loading && !polls.length` → a quiet loading affordance (brand pollen dot / simple skeleton —
   keep it calm per the design's "settle" motion, no spinner spam);
   (b) `!loading && polls.length === 0` → `<EmptyState>` (full-width, not inside the grid) with the
   "New polls show up here" copy and a "Create a poll" CTA to `/polls/new`;
   (c) otherwise → `<div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">` of
   `<PollCard v-for="poll in polls" :key="poll.id" :poll="poll" @share="..." />`. Handle the `share`
   emit with a stub for now (e.g. `console.debug` or a no-op handler) — the share box is a later
   phase. On `error`, show a small `text-coral` message with a "Try again" button calling
   `list()` again.
10. **Keep the view thin.** No formatting/aggregation logic in `Dashboard.vue` — date/timezone
    formatting lives in `lib/datetime.ts`, fetching lives in the store, presentation lives in
    `PollCard`/`EmptyState`. The view only composes and switches between the three states.

## Verification
- `npm run build` (or the `vue-tsc --noEmit` typecheck script create-vue scaffolds, e.g.
  `npm run type-check`) from `frontend/` passes with no TypeScript errors — confirm the exact script
  name in `frontend/package.json` from the phase-1 scaffold and run that one. All ids must typecheck
  as `string`.
- `npm run lint` (the ESLint script create-vue generates) passes for the new/changed files.
- Component test for code THIS phase adds (Vitest + @vue/test-utils, the scaffold's `npm run test:unit`):
  - `PollCard` renders the **"Open"** badge + "Manage" button when `status:'open'`, and the
    **"Completed"** badge + "View results" button when `status:'completed'`.
  - `PollCard` renders **N** `.pollen-dot` elements when a response count of N is supplied, and
    renders **zero** dots / no count line when the count is absent (the real-API case).
  - `PollCard`'s primary button targets `/polls/{id}` using the string id (assert the `to`/`href`).
  - `Dashboard` shows `<EmptyState>` when the store's `polls` is empty and shows a `PollCard` grid
    when `polls` has entries — mock `pollStore.list()` so no real network call happens.
- Manual UI check against `docs/design/mockups/screens/dashboard.html` and
  `docs/design/mockups/components/poll-card.html`: dusk background, golden pollen badges on open
  cards, mint badge on the completed card, the dashed empty-state panel, and the "New poll" button —
  all rendered in the poll's IANA timezone (not the browser's). Numerals (counts/dates) are
  Space Grotesk via `.num`.

## Acceptance
- [ ] Visiting `/dashboard` while authenticated calls `GET /api/polls` once (with cookie
      credentials) and renders one `PollCard` per returned poll, newest first (no client re-sort).
- [ ] An account with no polls shows the `EmptyState` panel (dashed border, "New polls show up here")
      and **no** empty grid.
- [ ] An open poll renders the gold "Open" badge + "Manage" button; a completed poll renders the
      mint "Completed" badge + "View results" button; both primary buttons navigate to
      `/polls/{id}`.
- [ ] The card never fabricates data the list API does not return: when no response count is present
      it omits the count line and grains; when no `dates` are present it omits the date range and
      shows the timezone alone — with a tracked `TODO(phase-hardening)` for adding `_count`/dates
      to the backend list endpoint.
- [ ] The "New poll" button and the empty-state CTA both route to `/polls/new`.
- [ ] `npm run build` / type-check and the `PollCard` + `Dashboard` component tests pass.
