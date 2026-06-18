# Pollendar — Mobile-Friendly Redesign Overview

_Date: 2026-06-18 · Status: **exploration** (synthesis of 7 read-only lens explorations; no code changed)_

This is a self-contained map + strategy for making Pollendar mobile-friendly. Each `##` section is sized to be lifted into a future `/plan` custom prompt. Every claim is grounded in real files — see the `file:line` citations.

---

## TL;DR & recommendations

**Six decisions, up front:**

1. **Responsive-FIRST, single codebase.** No separate mobile app, no `/m` routes. One Vue component tree, mobile-first Tailwind v4 utilities (base = phone, `sm`/`md`/`lg` progressively enhance). The app is already a conditional shell keyed on `route.meta.public` (`frontend/src/App.vue`, router at `frontend/src/router/index.ts`) — we extend it, not fork it.
2. **Adaptive DOM-switching ONLY for the two data-dense surfaces.** A single CSS layout cannot stretch the availability matrix from a desktop table to a phone gracefully, so those two surfaces (editor calendar, voter matrix) swap DOM structure via a tiny `useBreakpoint()` composable. Everywhere else is pure CSS responsive (flex/grid + breakpoint utilities).
3. **Editor → calendar multi-select + bulk-slot.** Replace the one-date-at-a-time list (`DateSlotEditor` + `DateCard` + `SlotRow`) flow with: month calendar → tap-multi-select dates → "bulk apply" panel with preset chips (Morning / Noon / Evening / All-day) + custom start/end → apply to ALL selected dates → per-date override. A **`Calendar | List`** segmented toggle keeps the current list view. **Produces the identical `CreatePollPayload` — no API change** (verified: `frontend/src/types/poll.ts`).
4. **Voter → per-participant matrix.** Desktop = table (rows = participants incl. the current voter's editable row, columns = slots, cells = yes/maybe/no). Mobile = per-slot cards grouping name chips by yes/maybe/no with the voter's tri-state control inline. A **`Vote | Results`** segmented toggle switches editing-your-own vs seeing-everyone. The matrix is **visible to anyone holding the share link**, at all times — open *and* closed polls, no submit-gate (decided 2026-06-18). Access = possession of the unguessable share token (capability URL), *not* a world-public/discoverable endpoint. **This requires a NEW backend endpoint** — see §8.
5. **Mockups: SELECTIVE, and YES mock the 2 novel surfaces before planning them.** A full HTML mockup set already exists under `docs/design/mockups/` (screens + components + foundations). Build NEW mobile+desktop HTML mockups for ONLY the two novel interactions (calendar editor, participant matrix) using the same tokens, **before** writing their Vue plans. Skip mockups for the purely-responsive refactor of existing screens — go straight to a token-guided responsive pass.
6. **Two view-toggles, one pattern.** Both the editor (`Calendar | List`) and the voter (`Vote | Results`) get a segmented control; persist the user's choice in `localStorage`.

**User ask → decision map:**

| User ask | Decision |
|---|---|
| Make the whole app responsive | Responsive-first single codebase; mobile-first Tailwind v4 on existing tokens; fix touch targets + safe-area + sticky bars (§4, §5) |
| Editor: pick a SET of dates from a calendar | New month calendar, tap-to-multi-select (NOT range start/end) (§6) |
| Editor: bulk-apply slots / all-day to all dates | "Bulk apply" panel: preset chips + custom, applied to every selected date at once (§6) |
| Editor: presets morning/noon/evening | Preset chips → each chip is a `PollSlotInput`; no schema change (§6) |
| Editor: toggle list view ↔ calendar view | `Calendar \| List` segmented control over the same `dates[]` array (§6) |
| Voter: a ROW per availability, yes/maybe/no | Keep tri-state `AvailabilityToggle`; restructure into matrix (§7) |
| Voter: see WHO ELSE voted | Per-participant matrix — **new backend endpoint required** (§7, §8) |
| Should we create mockups at all / before planning? | **Yes, but only for the 2 novel surfaces, before their plans.** Existing screens skip mockups (§9) |

---

## Current app map

**Stack.** `frontend/` = Vue 3.5.38 + Vite 8 + TailwindCSS v4.3 (CSS-first `@theme`, no `tailwind.config.js`) + Pinia 3 + vue-router. `backend/` = NestJS 11 + Prisma 7 + MySQL 8.4. No UI component library — all custom. Design tokens ("Dusk Calendar" dark theme: `pollen`, `canvas`, `surface`, `surface2`, `line`, `moonlight`, `dim`, `mute`, `yes`/`maybe`/`no`, `coral`, `mint`) live once in `frontend/src/assets/main.css` `@theme`.

**Routes → views** (`frontend/src/router/index.ts`, 6 routes — verified):

| Path | Name | View | Auth | Layout |
|---|---|---|---|---|
| `/` | landing | `Landing.vue` | public | full shell |
| `/auth/callback` | auth-callback | `AuthCallback.vue` | public | full shell |
| `/dashboard` | dashboard | `Dashboard.vue` | `requiresAuth` | full shell + nav |
| `/polls/new` | poll-new | `PollEditor.vue` | `requiresAuth` | full shell + nav |
| `/polls/:id` | poll-manage | `PollManage.vue` | `requiresAuth` | full shell + nav |
| `/p/:publicToken` | public-poll | `PublicPoll.vue` | `meta.public` | minimal wordmark-only |
| `/p/:publicToken/done` | public-thanks | `PublicThanks.vue` | `meta.public` | minimal wordmark-only |

**App shell.** `frontend/src/App.vue` branches on `route.meta.public`: authed routes get `AppNav` + centered `<main class="mx-auto max-w-6xl px-6 py-8">`; public routes render their own minimal header (no nav). `AppNav.vue` is a sticky `z-10` header (`max-w-5xl`, `backdrop-blur`) with `BrandMark` + auth-action slot — **no mobile collapse/hamburger, no safe-area-inset**.

**Pinia stores:**

- `authStore` (`stores/authStore.ts`): `user`, `status`, `isAuthenticated`, `bootstrap()` (one-time `/auth/me`), `requestLink`, `verify`, `logout`. Cookie-based (httpOnly), no JWT in JS.
- `pollStore` (`stores/pollStore.ts`) — creator-side: `polls`, `currentPoll`, `results`, `invite`, `create()`, `list()`, `get(id)`, `loadResults()`, `loadInviteMessage()`, `complete(pollId, finalSlotId)`.
- `publicPollStore` (`stores/publicPollStore.ts`) — participant-side: `poll`, `results`, `loadState`, `submitState`, `errorCode` (409 = duplicate email), `load(token)`, `submit(token, payload)`, `loadResults(token)`.

**API client.** `frontend/src/lib/api/client.ts` — thin fetch wrapper over `VITE_API_BASE` (`/api`), `credentials: 'include'`, throws typed `ApiError {status, body}`. Views never call fetch directly; stores do.

**Component inventory by surface:**

| Surface | Components |
|---|---|
| Shell | `layout/AppNav.vue`, `BrandMark.vue`, `ui/Button.vue` |
| Editor (creator) | `views/PollEditor.vue`, `DateSlotEditor.vue`, `DateCard.vue`, `SlotRow.vue` |
| Voter (public) | `views/PublicPoll.vue`, `PollSlotRow.vue`, `AvailabilityToggle.vue`, `views/PublicThanks.vue` |
| Results (creator) | `views/PollManage.vue`, `BestSlotBloom.vue`, `AvailabilityGrid.vue`, `ResultsTable.vue`, `ShareBox.vue` |
| Types / utils | `types/poll.ts`, `lib/api/types.ts`, `lib/utils/timezone.ts`, `lib/participantToken.ts` |

**Note:** `AvailabilityToggle` (tri-state Yes/Maybe/No) and `PollSlotRow` are reused in BOTH the editor's reactive preview (non-interactive) AND the participant voting view (interactive). Don't conflate them.

---

## Mobile-readiness audit

Current responsive coverage is **only ~33% (10 of 30 Vue files use `sm:`/`lg:`)** — and **no `md:` breakpoint is used anywhere**, so tablets jump straight from `sm` to `lg`. Viewport meta is set; **no `safe-area-inset` support exists anywhere**. Desktop-first patterns dominate the two interaction-heavy surfaces.

**What breaks / is awkward on a phone today:**

| Surface | Issue | Evidence |
|---|---|---|
| Results matrix | `min-w-[640px]` table forces horizontal scroll on every phone; no stacked fallback | `AvailabilityGrid.vue:65` (verified) |
| Results matrix | Sticky `left-0 z-10` "Who" column + colspan header assume many slots/row; reflows badly when narrow | `AvailabilityGrid.vue:68–75` (verified) |
| Results table | `grid grid-cols-12` (col-span 5/5/2) leaves <100px per logical column on a 375px phone | `ResultsTable.vue:~85` |
| Editor | Two-column `lg:grid-cols-[minmax(0,1fr)_360px]` preview sidebar; on mobile sidebar drops below form, users scroll past preview | `PollEditor.vue:116` |
| Editor `SlotRow` | `flex flex-wrap items-center gap-2` of label + toggle + two `type="time"` inputs + remove button wraps chaotically on ~320–375px; time inputs use `field-sizing-content` (auto-width) and can squeeze unreadably | `SlotRow.vue:66`, `:102–117` (verified) |
| Editor `SlotRow` | Remove button `px-2 py-1` (~28px) and toggle `px-2.5 py-1` (~32px) below the 44px touch-target minimum | `SlotRow.vue:121–127`, `:78–99` (verified) |
| Voter toggle | `AvailabilityToggle` buttons `py-1.5 px-3` (~36px) fail the 44×44px WCAG/iOS/Android minimum | `AvailabilityToggle.vue:~49` |
| Voter footer | Sticky `fixed inset-x-0 bottom-0` footer + hardcoded `pb-40` (160px dead space); **no `env(safe-area-inset-bottom)`** — Dynamic Island / home indicator overlaps the submit button | `PublicPoll.vue:~98`, `:~227` |
| Shell | `AppNav` sticky header has **no `env(safe-area-inset-top)`**; notch overlaps nav | `AppNav.vue:~6` |
| Typography | Headings like `text-3xl sm:text-4xl` have no sub-`sm` shrink → can overflow on XS phones | `Dashboard.vue:26`, `PollEditor.vue:~112` |
| `type="time"` / closesAt | Native mobile time picker is a UX win (keep it); but `closesAt` UI uses a `datetime-local`-style input that is cramped under a phone keyboard | `PollEditor.vue:138–155` |

**Severity:**

| Severity | Items |
|---|---|
| **High** (blocks core task on phone) | `AvailabilityGrid` `min-w-[640px]` matrix; `SlotRow` wrap + tiny time inputs; voter sticky footer no safe-area + `pb-40`; touch targets <44px (toggle, remove) |
| **Medium** (awkward but usable) | Editor two-col sidebar on mobile; `ResultsTable` 12-col squeeze; `AppNav` no safe-area / no collapse; missing `md:` tablet layouts |
| **Low** (polish) | Heading scale on XS; card `p-6` padding not tightened on mobile; `BestSlotBloom` `text-5xl` score on narrow cards |

---

## Mobile strategy

**Responsive-first vs adaptive — the decision and why.**

- **Default = responsive-first, pure CSS, single DOM.** Mobile-first base styles, `sm`/`md`/`lg` enhance. This covers landing, dashboard, manage chrome, about-you forms, nav, sticky bars. One tree, no JS branching — predictable cascade, no style duplication. (Per `mobile-ux-research`: prefer CSS Grid/Flexbox over `matchMedia` branching; reserve JS only where the trees fundamentally differ — https://moldstud.com/articles/p-css-media-queries-vs-javascript-when-to-use-each-for-optimal-responsiveness.)
- **Adaptive (DOM-switch) ONLY for 2 surfaces.** The availability matrix cannot become a phone-friendly layout by CSS alone (a `<table>` of N-slot columns vs stacked per-slot cards is a different DOM). Same for the editor (a month calendar grid vs a per-date list). For these we render *different* markup behind a breakpoint check.

**The `useBreakpoint` composable** — `frontend/src/composables/useBreakpoint.ts` (new):

- Wraps `window.matchMedia` against the Tailwind v4 token breakpoints (`sm:640`, `md:768`, `lg:1024`), exposing reactive `isPhone` / `isTablet` / `isDesktop` refs; SSR-safe default + listener cleanup.
- **Used by exactly two surfaces:** the editor (`PollEditor` / new `CalendarDateEditor`) to choose calendar-grid vs list, and the voter matrix (new `ParticipantMatrix`) to choose table vs card-stack. Everything else stays pure CSS — do NOT spread `useBreakpoint` across the app.

**Tailwind v4 breakpoint system (mobile-first on existing tokens).** Keep the `@theme` token set in `main.css` unchanged (no new colors needed). Adopt the mobile-first cascade everywhere: base = phone, then `sm:`/`md:`/`lg:`. Introduce `md:` for tablet layouts (e.g. editor preview shrinks `md:grid-cols-[minmax(0,1fr)_300px]`; dashboard `md:grid-cols-2`).

**Conventions to bake in (add as `@layer` utilities in `main.css`):**

- **Touch targets ≥ 44×44px** on all interactive controls (toggle buttons, vote buttons, preset chips, calendar cells, remove buttons), ≥10px gap between adjacent targets. Bump `AvailabilityToggle` `py-1.5`→`py-2.5` on mobile, `SlotRow` remove `px-2 py-1`→`px-3 py-2`. (https://blog.logrocket.com/ux-design/all-accessible-touch-target-sizes/)
- **Sticky action bars** 56–64px tall, safe-area aware: `pb-[max(16px,calc(16px+env(safe-area-inset-bottom)))]`. Replace `PublicPoll`'s hardcoded `pb-40` with a `.pb-with-footer` utility. (https://www.eleken.co/blog-posts/footer-ux)
- **Safe-area** on every fixed/sticky element: `AppNav` gets `pt-[max(…,env(safe-area-inset-top))]`; footers + future bottom-sheets get bottom/left/right insets.
- **Nav/shell responsiveness.** `AppNav`: collapse to a compact header on phones (BrandMark + a single primary action or a small menu), full nav `sm+`; add safe-area top. Reduce container padding `px-6`→`px-4` base, `sm:px-6`. Cards `p-4` base, `sm:p-6`.

---

## Redesign A — Candidate-times editor

**Goal.** Replace "add one date at a time" (current `DateSlotEditor` appends a date with a default 18:00–20:00 slot, then per-`DateCard` `SlotRow` editing) with a **calendar multi-select → bulk-slot apply** flow, on BOTH mobile and desktop, while emitting the **identical `CreatePollPayload`**.

**New UX flow:**

1. **Month calendar, tap-to-multi-select** (NOT a range start/end picker — Pollendar needs arbitrary dates like Mon/Wed/Fri). Selected dates highlight (`bg-pollen/30 ring-pollen`); a live count ("N selected", `aria-live="polite"`) shows above/below. Swipe / arrows for month navigation. (https://help.syncfusion.com/android/sfcalendar/datenavigation-and-gesture; pattern confirmed in Cal.com / Rallly / Crab.fit.)
2. **Bulk-apply panel** — a vertical stack of preset toggle-chips, each previewing its range inline:
   - **Presets are FIXED app-wide** (decided 2026-06-18) — define them once as a shared constant (e.g. `frontend/src/lib/slotPresets.ts`), NOT per-poll/configurable. Proposed defaults (tweak the constant, not the UI): **Morning 09:00–12:00**, **Noon/Afternoon 12:00–14:00**, **Evening 18:00–21:00**, **All-day**, plus **Custom** start/end.
   - "Apply to all selected dates" multiplies the chosen slot set across every selected date. (Chip UI: https://www.setproduct.com/blog/chip-ui-design; time-preset UX: https://www.eleken.co/blog-posts/time-picker-ux.)
3. **Per-date override afterward** — tweak or remove slots on an individual date (the current `DateCard`/`SlotRow` editing, reused).
4. **`Calendar | List` segmented toggle** — switches to the current list editor. Both views mutate the **same `dates[]` ref**, so data never diverges; persist choice in `localStorage`. (Segmented control: https://mobbin.com/glossary/segmented-control.)

**Data mapping (NO API change — verified `frontend/src/types/poll.ts`):**

- Selected dates → a `Set<string>` of `eventDate` (`"YYYY-MM-DD"`).
- Each preset chip → a `PollSlotInput` (`{ startTime?, endTime?, isAllDay?, label? }`). All-day = `{ isAllDay: true }` (no times); timed = `{ startTime, endTime, label }`.
- Bulk apply → `dates[]` becomes `selectedDates.map(d => ({ eventDate: d, slots: [...chosenSlots] }))`.
- `buildPayload()` still emits `{ title, description?, timezone?, dates: PollDateInput[] }` → `POST /api/polls`. `closesAt` stays **PATCH-only** (`PATCH /api/polls/:id`), excluded from the create payload exactly as today.
- **`sortOrder` caveat:** `PollDateInput`/`PollSlotInput` have optional `sortOrder`, currently never set (backend-assigned). If the new calendar/bulk flow ever drag-reorders dates or slots, populate `sortOrder` before submit; otherwise leave unset.
- **Validation unchanged:** a date needs ≥1 slot; a timed slot needs both start & end (`SlotRow.vue:50–53`). All-day is always valid. End-after-start is NOT validated today — out of scope.

**Component breakdown:**

| Component | Status | Role |
|---|---|---|
| `CalendarDateEditor.vue` | **new** | Month grid + multi-select state + bulk-apply panel; emits `dates[]` |
| `SlotPresetChips.vue` | **new** | Preset chip set + custom start/end; produces `PollSlotInput[]` |
| `DateSlotEditor.vue` | reused | The "List" view behind the toggle |
| `DateCard.vue`, `SlotRow.vue` | reused | Per-date override; bump touch targets, add min-width to time inputs |
| `useBreakpoint.ts` | **new (shared)** | Phone → calendar default; desktop → both views available |
| Preview sidebar | refactor | `md:sticky` instead of `lg:sticky`; on phone, fold into a "Show preview" button / bottom-sheet so it isn't orphaned below a long form |

---

## Redesign B — Public availability view

**Goal.** Let each voter (a) vote yes/maybe/no per slot (keep `AvailabilityToggle` tri-state), and (b) **see WHO ELSE voted and what they picked** — a per-participant matrix.

**Current state (verified).** `PublicPoll.vue` groups slots by date into `PollSlotRow` list items (label + time + tri-state toggle), with a "Leaning so far" sticky footer driven by `results.best`. Results are **aggregate-only**: `GET /api/public/polls/:token/results` → `PollResults { best, slots: SlotTally[] }` where `SlotTally = {slotId, available, maybe, unavailable, score}`. **No per-participant rows are exposed by any endpoint today** (`AvailabilityGrid.vue:6–9` documents this explicitly). So Redesign B is blocked on backend work (§8).

**New UX:**

- **`Vote | Results` segmented toggle** — "Vote" = edit your own availability (current form); "Results" = the everyone-matrix. Persist in `localStorage`. **Results is available to anyone holding the share link, at all times** (decided 2026-06-18): no "must submit first" gate, shown even before the visitor votes. The link itself is the access control — not a discoverable public page.
- **Closed polls still show the matrix.** Today `PublicPoll.vue:146–155` replaces everything with a "This poll is closed" notice. Change that: when closed, disable the **Vote** tab/inputs but keep **Results** (the matrix) visible — transparency holds after close.
- **Desktop (table)** — rows = participants (including **the current voter's own editable row** with live tri-state controls), columns = slots grouped by date, cells = yes/maybe/no colored states. Mirrors the creator `AvailabilityGrid` structure but per-participant. Sticky left column = names; horizontal scroll + visible date headers; winning slot still blooms.
- **Mobile (per-slot cards)** — DOM-switch via `useBreakpoint`: one full-width card per slot, showing name chips grouped under Yes / Maybe / No (with an optional "+N more"), and the current voter's tri-state control inline at the top of each card. Avoids unbounded horizontal scroll. (Card-view for tables on mobile: https://medium.com/design-bootcamp/designing-user-friendly-data-tables-for-mobile-devices-c470c82403ad; avatar/count chips: https://mobbin.com/glossary/chip; matrix heatmap with pinned column: https://m2.material.io/design/layout/responsive-layout-grid.html.)
- **Submit** still `POST /api/public/polls/:token/responses` → `{ publicToken }` (the participant edit token, persisted to `localStorage` as `pollendar:pt:<token>` via `lib/participantToken.ts`). No change to submission shape.
- Keep the sticky safe-area-aware action bar; shrink "Leaning so far" + submit to a single line on phones.

**Component breakdown:**

| Component | Status | Role |
|---|---|---|
| `ParticipantMatrix.vue` | **new** | Adaptive: table (desktop) vs per-slot card-stack (mobile) via `useBreakpoint` |
| `PollSlotRow.vue`, `AvailabilityToggle.vue` | reused | The "Vote" tab; bump toggle to ≥44px |
| `publicPollStore.ts` | extend | New action to load per-participant rows from the new endpoint (§8) |

---

## Backend work required ("who voted")

**This is the pivotal dependency for Redesign B.** State plainly:

> Today the public surface exposes **only aggregate `SlotTally`** (counts per slot), never per-participant rows. Verified: `PublicService.getResults()` runs raw SQL that `GROUP BY s.id` and sums availability (`backend/src/public/public.service.ts:91–110`); `PublicController` has only `GET polls/:token`, `GET polls/:token/results`, `POST polls/:token/responses` (`backend/src/public/public.controller.ts`). **There is no participant-list endpoint.** The DB *has* the data — `Participant {id, pollId, publicToken, displayName, email}` and `Response {participantId, pollSlotId, availability}` (`prisma/schema.prisma`) — it's simply not surfaced.

**New endpoint:**

- **Method + path:** `GET /api/public/polls/:token/participants-responses`
- **Query params (optional):** `?limit=100&offset=0` (default 100, cap ~1000) for pagination on mobile.
- **Response DTO:**
  ```jsonc
  {
    "participants": [
      {
        "participantId": "123",
        "displayName": "Alice",
        "answers": [
          { "slotId": "456", "availability": "available" },
          { "slotId": "457", "availability": "maybe" }
        ]
      }
    ],
    "total": 42,
    "hasMore": true
  }
  ```
  BigInt ids are stringified by the existing global `BigIntSerializerInterceptor`. `availability` is the Prisma enum literal `'available' | 'maybe' | 'unavailable'`.

- **Service method** `PublicService.getParticipantResponses(token, limit?, offset?)` — Prisma query joining `Response → Participant`, scoped to the poll via the share token, **selecting `{ id, displayName }` from Participant only**:
  ```ts
  const rows = await this.prisma.response.findMany({
    where: { slot: { date: { poll: { publicToken: token } } } },
    include: {
      participant: { select: { id: true, displayName: true } }, // email EXCLUDED
      slot: { select: { id: true } },
    },
    orderBy: [{ participantId: 'asc' }, { slot: { id: 'asc' } }],
  });
  ```
  Then group by `participantId` in the service. (For large polls, a raw `JOIN responses → participants → poll_slots → poll_dates WHERE poll_id = ?` ordered by `p.id, s.id` with `LIMIT/OFFSET` is faster; indexes exist via the `responses @@unique([participantId, pollSlotId])` constraint.)

- **Privacy rule (hard):** **`displayName` only, NEVER `email`.** `Participant.email` exists in the DB and is unique-per-poll, but it must not appear on any public endpoint. Enforce via the `select` above.
- **No state change / idempotent read.** Reuse the existing GET throttling posture; `SlotTally` cache is untouched (this reads live `Response` rows).
- **Access (decided 2026-06-18): link-only capability, NOT a world-public endpoint.** The 22-char `Poll.publicToken` in the URL *is* the access control — same trust model as the existing `GET polls/:token` / `.../results`. Unauthenticated (no login/account), no submit-gate, returns rows for **any valid share token regardless of poll status** (open or closed). But it is **unlisted**: no listing/enumeration endpoint, token is high-entropy (`Char(22)`) so not guessable, don't log it, don't make it crawlable/SEO-indexable. Anyone the link is *forwarded* to can see participant **display names** — that's the intended transparency, which is exactly why the `select` exposes `displayName` only and **never `email`**.

**Files to touch:**

| File | Change |
|---|---|
| `backend/src/public/dto/participant-responses.dto.ts` | **new** — `ParticipantRow`, `ParticipantResponseAnswer`, `ParticipantResponsesResult` |
| `backend/src/public/public.service.ts` | **add** `getParticipantResponses(token, limit?, offset?)` |
| `backend/src/public/public.controller.ts` | **add** `@Get('polls/:token/participants-responses')` |
| `frontend/src/lib/api/public-poll.ts` + `lib/api/types.ts` | **add** client method + wire types |
| `frontend/src/stores/publicPollStore.ts` | **add** action + state for the participant rows |

> **No partial capability exists to reuse** — `submitResponses` writes participants but reads nothing back per-row; this endpoint is net-new. Do NOT touch poll creation/edit/complete or the existing results endpoint.

---

## Design & mockups plan

**Should we create mockups at all / before planning? — YES, but selectively.**

A full HTML mockup set already exists and defines the visual language: `docs/design/mockups/` contains `screens/` (`landing.html`, `dashboard.html`, `poll-editor.html`, `poll-manage.html`, `public-poll.html`, `public-thanks.html`), `components/` (`availability-grid.html`, `availability-toggle.html`, `date-slot-editor.html`, `results-table.html`, `share-box.html`, `form-fields.html`, `buttons.html`, `poll-card.html`, `best-slot-badge.html`), and `foundations/`. These establish tokens + patterns we should NOT re-mock.

**Decision:** mock the **two novel interaction models only**, before writing their Vue plans (paper iteration is cheap; Vue iteration is expensive for new interactions). Skip mockups for the responsive refactor of existing screens — those already have a mockup and a token system; go straight to a responsive pass.

**ADD these mockups under `docs/design/mockups/` (extend the existing tokens/foundations):**

| New mockup | Surface | Why |
|---|---|---|
| `screens/poll-editor-calendar.mobile.html` | Editor calendar multi-select + bulk-slot, phone | Novel interaction; validate tap-multi-select + chip presets ergonomics |
| `screens/poll-editor-calendar.desktop.html` | Same, desktop with `Calendar\|List` toggle | Confirm both-views layout |
| `screens/public-poll-matrix.mobile.html` | Voter per-slot card matrix (name chips by yes/maybe/no), phone | Novel; validate card grouping + inline voter control |
| `screens/public-poll-matrix.desktop.html` | Voter participant table + `Vote\|Results` toggle | Confirm table density + sticky name column |
| `components/segmented-toggle.html` (optional) | Shared `Calendar\|List` / `Vote\|Results` control | Reused by both surfaces |
| `components/date-calendar.html` (optional) | The month multi-select grid in isolation | Reused unit |

**NO new mockup needed** (responsive pass guided by existing tokens only): `landing.html`, `dashboard.html`, `poll-manage.html` chrome, `public-thanks.html`, the "About you" form, nav/shell, `share-box`, `results-table`/`best-slot-badge` (responsive tweaks only).

---

## Proposed workstreams / phase seeds

Ordered, plannable workstreams — lift each line into a `/plan` custom prompt. `solo` = single agent; `workflow` = parallel fan-out.

| # | Objective | Files / layers | Solo vs workflow | Depends on |
|---|---|---|---|---|
| **1. Responsive foundations** | Mobile-first tokens/utilities: `useBreakpoint` composable, safe-area utilities, `.pb-with-footer`, touch-target conventions, `md:` breakpoint adoption, responsive `AppNav` shell + container padding | `assets/main.css`, `App.vue`, `layout/AppNav.vue`, **new** `composables/useBreakpoint.ts` | solo | — |
| **2. Responsive pass: landing + dashboard** | Mobile-first refactor of existing screens (no DOM switch) | `views/Landing.vue`, `views/Dashboard.vue` | solo | 1 |
| **3. Responsive pass: voter form + manage chrome** | Sticky footer safe-area + `pb-40` fix; "About you" form; `PollManage` header/sidebar; `ShareBox`; `ResultsTable` / `BestSlotBloom` mobile sizing; `AvailabilityToggle`/`SlotRow` touch targets | `views/PublicPoll.vue`, `views/PollManage.vue`, `ShareBox.vue`, `ResultsTable.vue`, `BestSlotBloom.vue`, `AvailabilityToggle.vue`, `SlotRow.vue` | workflow | 1 |
| **4. Mockups: 2 novel surfaces** | Build the 4–6 new HTML mockups (editor calendar + voter matrix, mobile + desktop) on existing tokens | `docs/design/mockups/screens/*`, `components/*` | solo | 1 (tokens) |
| **5. Backend: "who voted" endpoint** | New `GET /api/public/polls/:token/participants-responses` + DTO + service (displayName only, never email) + client/store wiring | `backend/src/public/{controller,service}.ts`, **new** DTO; `frontend/lib/api/public-poll.ts`, `types.ts`, `stores/publicPollStore.ts` | solo | — (can start anytime; **gates #7**) |
| **6. Redesign A — calendar editor** | `CalendarDateEditor` + `SlotPresetChips` + `Calendar\|List` toggle; emits identical `CreatePollPayload`; reuse `DateSlotEditor`/`DateCard`/`SlotRow` for List + per-date override; preview as bottom-sheet on phone | `views/PollEditor.vue`, **new** `CalendarDateEditor.vue`, `SlotPresetChips.vue`; reuse `DateSlotEditor.vue`, `DateCard.vue`, `SlotRow.vue`; `useBreakpoint` | workflow | 1, 4 |
| **7. Redesign B — participant matrix** | `ParticipantMatrix` (table desktop / card-stack mobile via `useBreakpoint`) + `Vote\|Results` toggle + voter's own editable row | `views/PublicPoll.vue`, **new** `ParticipantMatrix.vue`; reuse `PollSlotRow`/`AvailabilityToggle`; `stores/publicPollStore.ts` | workflow | 1, 4, **5** |

---

## Open questions & decisions needed

1. ~~**Calendar selection model**~~ — **DECIDED (2026-06-18): multi-select tap-to-toggle** (Mon/Wed/Fri), not a range picker. See §6 step 1.
2. ~~**Who sees the matrix, and when**~~ — **DECIDED (2026-06-18): anyone with the share link, at all times** (full transparency, like When2meet — open *and* closed polls, no submit-gate). Access = the unguessable share token (capability URL / unlisted), **not** a world-public discoverable endpoint. Same trust model as the existing public poll/results routes. See §7, §8.
3. **Email-gate vs identity** — names are public-safe (voter-chosen), email never is. Does showing names change the optional-email UX (e.g. prompt for a recognizable display name)? Should duplicate-name handling exist?
4. **Matrix scale / virtualization** — at what participant count does the table/card-stack need pagination or virtual scrolling? The endpoint already proposes `limit/offset` (default 100); pick a threshold for the frontend.
5. ~~**Preset times**~~ — **DECIDED (2026-06-18): fixed app-wide**, not per-poll/configurable — define once as a shared constant (§6 step 2). Proposed default ranges (Morning 09:00–12:00 · Noon/Afternoon 12:00–14:00 · Evening 18:00–21:00) are tweakable in that constant but out of scope to make user-configurable.
6. **`closesAt` placement** — it's PATCH-only and currently surfaced in the editor but excluded from create. Keep it in the new editor, move it to the manage view, or add a UI hint ("set after creating")?
7. **`sortOrder` on reorder** — if the calendar/bulk flow allows drag-reordering of dates or slots, we must populate `sortOrder` before submit (currently always backend-assigned). Decide whether reorder is in scope for Redesign A.
8. **View-toggle persistence scope** — `localStorage` per-device is proposed for both toggles; confirm that's acceptable vs. resetting to a default each visit.
