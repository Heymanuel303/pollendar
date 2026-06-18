# Pollendar Frontend Build-Out (Vue 3 + Tailwind v4)

**Slug:** `frontend-build-out` (folder: `docs/plans/2026-06-18-frontend-build-out/`)
**Created:** 2026-06-18
**Status:** in-progress

## Goal
Build the real Pollendar frontend — a Vue 3.5 + Vite + TypeScript (strict) SPA — implementing every
route/view/component in `docs/DESIGN.md §8`, styled to the **"Dusk Calendar"** design system in
`docs/design/DESIGN-UI.md` and the mockups in `docs/design/mockups/`, wired to the finished NestJS
backend at base path **`/api`** with cookie credentials. This is PLAN.md **Phase 7** and feeds
PLAN.md **Phase 8 (Hardening)**.

## Scope
- **`frontend/`** — scaffolded from scratch (currently only `README.md`): router, Pinia stores,
  views, components (incl. `components/ui/` primitives), `lib/` API client + utils, `assets/main.css`.
- **`backend/src/main.ts`** — one required edit in Phase 7 only: `app.enableCors({ origin: CORS_ORIGINS, credentials: true })` (currently **no `enableCors()` call exists**, so the credentialed SPA cannot reach the API cross-origin without it).

## Out of scope
- Any other backend behavior change (DTOs, services, controllers) — the frontend consumes the API as-is.
- The participant **edit-after-submit** UI flow end-to-end — its `PUT /public/participants/:participantToken`
  endpoint is **not implemented on the backend** (see Open questions). Phase 5 persists the participant
  token forward-compatibly but does not build the edit screen.
- PLAN.md Phase 8 server-side hardening (validation pipe, exception filter, throttling) — already on the backend.

## Constraints
- Node 22, Vue 3.5, Vite, Pinia 3, vue-router 4, TypeScript **strict**. Pin exact Vue/Vite/Tailwind
  versions from the generated lockfile at scaffold time (PLAN.md §1 note).
- **Tailwind CSS v4 via `@tailwindcss/vite`, CSS-first ONLY.** `src/assets/main.css` =
  `@import "tailwindcss";` + the `@theme {}` token block from DESIGN-UI.md, imported once in `main.ts`.
  **No `tailwind.config.js`, no PostCSS, no v3 `@tailwind` directives.** Motif helpers
  `.bg-dusk` / `.pollen-dot` / `.bloom` / `.bloom-bg` become small custom classes in `main.css`.
- Self-host fonts via `@fontsource/space-grotesk` + `@fontsource/inter` (imported in `main.ts`).
  Space Grotesk renders **all numerals** via a `.num` utility.
- **Cookie-based auth:** every API call uses `credentials:'include'`; the SPA never sees the JWT.
  Magic-link request always returns 200 (anti-enumeration). Dev emails land in Mailpit (`:8025`).
- **All ids are `string`** (BigInt serialized as strings). `availability` enum is the backend literal
  `'available' | 'maybe' | 'unavailable'` (yes/maybe/no is UI-color naming only).
- **Timezones:** render slot times in the poll's IANA `timezone` via native `Intl.DateTimeFormat`
  (`timeZone` option) — no extra tz dependency.
- **Maintainability (hard requirement):** thin views compose small components; data-fetching lives in
  Pinia stores. `AvailabilityToggle` (participant tri-state input) and `AvailabilityGrid` (read-only
  results constellation) stay **two separate components**.
- Build share/invite links from the app origin (`window.location.origin` / `VITE_APP_URL`), never hard-coded localhost.

## Acceptance criteria
- [ ] End-to-end through the UI (PLAN.md Phase 7): sign in via magic link (Mailpit) → create a poll →
      share → vote as a participant in another browser → watch the best slot update/bloom → complete →
      see the completion email in Mailpit.
- [ ] Visual fidelity matches the Dusk Calendar mockups (palette, bloom, constellation, typography).
- [ ] `npm run build` (Vite + `vue-tsc --noEmit`) and the lint script are green; no `tailwind.config.js`/PostCSS introduced.
- [ ] Per-component unit tests (`AvailabilityToggle`, `AvailabilityGrid`, `ResultsTable`) pass in their building phases; Playwright happy-path e2e passes (Phase 7).

## Phases
1. [01-scaffold-and-design-system](01-scaffold-and-design-system.md) — scaffold Vue/Vite/TS/Pinia/router, Tailwind v4 `@theme` tokens + fonts + motif classes, app shell + nav, credentials/BigInt-safe API client, base UI primitives · _solo_ ✓
2. [02-auth-flow](02-auth-flow.md) — `authStore`, `EmailGate`, Landing, AuthCallback (`?token=` → `/auth/verify`), router guards, `/auth/me` bootstrap · _solo_ ✓
3. [03-poll-editor](03-poll-editor.md) — `PollEditor` view + `DateSlotEditor` + `pollStore.create` (title/desc/timezone, nested dates+slots) · _solo_ ✓
4. [04-dashboard](04-dashboard.md) — `pollStore.list`, `Dashboard` view, `PollCard` (open/completed), empty state · _solo_ ✓
5. [05-public-poll-flow](05-public-poll-flow.md) — `PublicPoll` + `AvailabilityToggle` + `publicPollStore` (load/submit/results), participant-token persistence, `PublicThanks` · _solo_ ✓
6. [06-poll-manage-results](06-poll-manage-results.md) — `PollManage` view composing `AvailabilityGrid` + `ResultsTable` + `BestSlotBloom` + `ShareBox` + complete-poll flow; `pollStore.get/complete` · _**workflow**_
7. [07-e2e-and-production-hardening](07-e2e-and-production-hardening.md) — Playwright happy-path e2e, `VITE_` env config, required backend CORS edit, prod cookie/CORS notes, clean prod build · _solo_

## Open questions
- **Participant edit endpoint is missing.** `DESIGN.md §5/§8` specify `PUT /public/participants/:participantToken`,
  but `PublicController` does not implement it (only `GET poll`, `GET results`, `POST responses`). Phase 5
  persists the participant token but cannot wire a real edit screen. Decide before/around Phase 5–6:
  add a backend phase for the PUT route, or formally drop edit-after-submit from v1.
- **Stale DESIGN.md examples** (verified against the real backend, frontend follows the backend):
  `POST .../responses` returns **`{ publicToken }`** only (not `{ participantToken, results }`), so
  `PublicThanks` fetches `GET /results` separately; the submit answer field is **`pollSlotId`** (not `slotId`).
- **`GET /polls` list shape is thin** — returns raw poll rows (no `_count`/response count, no nested
  dates/date-range). Phase 4 renders count/date defensively and leaves a `TODO(phase-hardening)`; if the
  dashboard must show response counts, the list endpoint needs a backend follow-up.
- **`closesAt` is PATCH-only**, not accepted by `POST /polls` create. Phase 3 surfaces it in the UI but
  excludes it from the create call (set later via edit), or a backend follow-up adds it to create.
- Pin exact Vue/Vite/Tailwind v4 versions from the generated lockfile at scaffold time (Phase 1).
