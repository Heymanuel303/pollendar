# Phase 3: Straightforward app copy

**Plan:** [plain-copy-and-calm-glow](00-overview.md)
**Depends on:** 02-direct-winning-slot-copy.md
**Execution:** workflow

## Context
The wider feature makes Pollendar feel calmer and less AI-written: dial the glow/bloom visual effect down to near-flat (phase 1) and rewrite UI + email copy into a plain, direct voice. Phase 2 already replaced the winning-slot label "✦ In bloom" with "✦ Top pick" and reworded the results microcopy ("The highest score blooms." → "...is the top pick."). This phase rewrites all the *remaining* user-facing UI copy across the Vue views and components into a plain, direct voice, normalising punctuation (no em dashes in prose, keep `·` only in compact metadata) and keeping at most one light brand nod to the pollen idea. Phase 4 handles the backend emails; this phase touches none of them.

## Objective
Rewrite the remaining non-winning-slot UI copy across all frontend views and components into plain, direct language and update the unit tests that assert those strings.

## Files to touch
- `frontend/src/views/Landing.vue` — eyebrow (line 29), hero tagline (line 36), and the static preview status label (line 63). Hero h1 (line 33), pollen-dot reassurance (line 49) reviewed; keep or lightly adjust per style guide. Do NOT touch line 105 `✦ In bloom` (phase-2 label).
- `frontend/src/views/Dashboard.vue` — subheading (line 30), loading line (line 61), empty-state title + body props (lines 68-69). "Your polls" (28), "New poll" (37), "Create a poll" (76) reviewed; likely stay.
- `frontend/src/components/EmptyState.vue` — purely presentational; no hard-coded copy (title/body come from props). Verify only; the strings live in Dashboard.vue.
- `frontend/src/views/PollManage.vue` — status pill (line 203 `Open · gathering responses`), cancelled notice (line 262), loading line (line 176), and the doc-comment on line 19 ("which slot is in bloom"). Do NOT touch the `BestSlotBloom` usage or `.bloom`/`bloom-bg` classes.
- `frontend/src/views/PublicPoll.vue` — footer/sticky status (line 145), both "Leaning so far" labels (lines 253, 324), email optional label em dash (line 297), helper line (line 308), and the "be the first" fallback (line 331). Doc-comment line 14 mentions "Leaning so far" — keep in sync.
- `frontend/src/views/PublicThanks.vue` — "Leaning now" label (line 94), share heading (line 115), "Pass it along" line (line 116), footer prose (line 143). Do NOT touch line 97 `✦ In bloom` (phase-2 label) or the `bloom-bg`/`shadow-glow` classes.
- `frontend/src/views/PollEditor.vue` — create-mode subheading computed string (line 123), edit-mode subheading em-dash-free check (line 122). (PollEditor was not in the original findings list but carries in-scope UI prose; it is owned by the shared-labels agent.)
- `frontend/src/components/EmailGate.vue` — `helperText` default (line 9), "Check your inbox" block (lines 62-67), error string (line 30). Mostly plain already; verify only.
- `frontend/src/components/ShareBox.vue` — heading + sub (lines 37-38). Plain already; verify only.
- `frontend/src/components/PollCard.vue` — status badge labels (lines 37-42), "Final time locked" (line 73), "responses" (line 104). Plain already; verify only.
- `frontend/src/components/layout/AppNav.vue` — no hard-coded copy beyond the slotted brand mark. Verify only.
- `frontend/src/views/__tests__/PollManage.spec.ts` — line 103 asserts `'Open · gathering responses'`; update to the new pill text in the SAME phase.
- `frontend/src/views/__tests__/PublicPoll.spec.ts` — line 107 asserts `'Leaning so far'`; update to the new label.
- `frontend/src/views/__tests__/PublicThanks.spec.ts` — lines 77/83 assert the winning-slot label, which **phase 2 already changed to `'Top pick'`**; they belong to phase 2 and must NOT be touched here. If "Leaning now" changes, check no assertion depends on it (none currently does).

## Steps
1. **Landing.vue** — line 29 eyebrow: `Availability polling, in bloom` → `Group availability polling`. Line 36 tagline: `Pollendar gathers everyone's availability like pollen, and the best time blooms on its own.` → `Everyone marks when they're free, and Pollendar shows the time that works best.` (one direct sentence; drops "like pollen"/"blooms"). Line 63 preview status: `Europe/Brussels · gathering responses` → `Europe/Brussels · collecting responses`. Keep h1 line 33 `Find the time everyone can make.` and line 49 `Takes about a minute.` as-is (already plain). Leave line 105 `✦ In bloom` untouched (phase-2 label) and the `bloom-bg` class on line 55 untouched.
2. **Dashboard.vue** — line 30 subheading currently `Find the time everyone can make, track every gathering in one place.` Reword to a plain two-clause sentence without the comma splice, e.g. `Find a time everyone can make. See all your polls in one place.` Line 61 loading: `Gathering your polls…` → `Loading your polls…`. Lines 68-69 empty state: title `New polls show up here` (keep) and body `Start one and gather everyone's availability. Takes about a minute.` → `Create one to collect everyone's availability. Takes about a minute.` Keep `Your polls`, `New poll`, `Create a poll`.
3. **PollManage.vue** — line 203 pill: `Open · gathering responses` → `Open · collecting responses`. Line 262 cancelled notice: `This poll is cancelled. Reopen it to keep gathering responses.` → `This poll is cancelled. Reopen it to keep collecting responses.` Line 176 loading: `Loading poll…` (keep; already plain). Line 19 doc-comment `which slot is in bloom` → `which slot is the top pick` (it describes user-facing copy). Do NOT touch the `BestSlotBloom` element/comment block on lines 246-247 referring to the `.bloom` class as an implementation detail beyond the user-facing wording, and never rename the component or its `data-testid`.
4. **PublicPoll.vue** — line 145 status: `{{ isOpen ? 'gathering responses' : 'no longer accepting responses' }}` → `{{ isOpen ? 'collecting responses' : 'no longer accepting responses' }}`. Lines 253 and 324 label: `Leaning so far` → `Top pick so far`. Line 297 optional label: `Email <span class="text-mute">— optional</span>` → `Email <span class="text-mute">(optional)</span>` (remove em dash). Line 308 helper: `Only to notify you of the final time.` (keep; plain). Line 331 fallback: `No responses yet, be the first.` → `No responses yet. Be the first.` (split the comma splice). Update the doc-comment on line 14 (`a sticky "Leaning so far" footer`) → `a sticky "Top pick so far" footer`.
5. **PublicThanks.vue** — line 94 label: `Leaning now` → `Top pick so far` (harmonise with PublicPoll's footer label). Line 115 heading `Help find the time everyone can make` (keep; plain). Line 116: `Pass it along, it takes about a minute.` → `Pass it along. It takes about a minute.` (split the comma splice). Line 143 footer: `The organizer will confirm the final time, we'll email you if you left an address.` → `The organizer confirms the final time. We'll email you if you left an address.` (present tense, split sentence). Do NOT touch line 97 `✦ In bloom` (phase-2 label) or the `bloom-bg`/`shadow-glow` classes on line 91.
6. **PollEditor.vue** — line 123 create subheading `Find the time everyone can make. Takes about a minute.` (keep; already plain, no em dash). Line 122 edit subheading `Add or adjust times, or deactivate ones that no longer work, votes are kept.` → `Add or adjust times, or deactivate ones that no longer work. Existing votes are kept.` (split the comma splice). No em dashes introduced.
7. **EmailGate.vue / ShareBox.vue / PollCard.vue / AppNav.vue / EmptyState.vue** — verify only; these are already plain and contain no banned patterns. If a reviewing agent finds an em dash in prose or a hype adjective, fix it in place, otherwise leave unchanged. (EmailGate line 9 `No password. We'll email you a magic link.` and ShareBox lines 37-38 are already in-voice.)
8. **Tests** — in `frontend/src/views/__tests__/PollManage.spec.ts` line 103 change `expect(wrapper.text()).toContain('Open · gathering responses')` → `...toContain('Open · collecting responses')`. In `frontend/src/views/__tests__/PublicPoll.spec.ts` line 107 change `expect(wrapper.text()).toContain('Leaning so far')` → `...toContain('Top pick so far')`. Leave `PublicThanks.spec.ts` lines 77/83 (`'In bloom'`) untouched — they assert the phase-2 label.

## Execution strategy
- **Fan-out unit:** one agent per view/screen, each owning a DISTINCT set of files so no two agents edit the same file:
  - Agent A — `Landing.vue`.
  - Agent B — `Dashboard.vue` + `EmptyState.vue` + `PollCard.vue`.
  - Agent C — `PollManage.vue` + its spec `PollManage.spec.ts`.
  - Agent D — `PublicPoll.vue` + its spec `PublicPoll.spec.ts`.
  - Agent E — `PublicThanks.vue` + its spec `PublicThanks.spec.ts` (verify-only on the two `In bloom` assertions — must stay).
  - Agent F — shared UI + chrome: `AppNav.vue`, `EmailGate.vue`, `ShareBox.vue`, `PollEditor.vue`.
- **Shape:** pipeline — each agent rewrites its files' copy against the embedded style guide, then updates that file's affected unit tests, independently.
- **Isolation:** none — agents edit distinct files in the shared tree (the per-view split guarantees no overlap); no worktree needed.
- **Verify stage:** a final consistency agent greps the frontend for banned patterns (em dash in prose, "in bloom" outside the phase-2 winning-slot label, "like pollen", "blooms", hype adjectives such as seamless/effortless/elevate/delightful/magical/unlock), confirms the voice is uniform across views, runs `cd frontend && npm run type-check && npm run test:unit`, and reports any file still off-voice. It must NOT flag the `.bloom`/`bloom-bg` CSS classes, the `BestSlotBloom` component, the `data-testid="best-slot-bloom"`, or the phase-2 `✦ In bloom` / `Top pick` winning-slot labels.

## Embedded style guide (apply consistently)
- **Voice:** plain, direct, present tense. Say what the thing is or does. Lead with the action. Short declarative sentences.
- **Ban:** metaphor-as-explanation, hype adjectives (seamless, effortless, elevate, delightful, magical, unlock), rule-of-three lists, and "not just X, it is Y" constructions.
- **Winning-slot label** is exactly "✦ Top pick" (keep the ✦). That is owned by **phase 2**; do NOT re-touch it here.
- **Punctuation:** do NOT use em dashes (—) inside full sentences; use a period, comma, or parentheses instead. Keep the middot (·) ONLY as a compact separator inside short metadata labels (e.g. "Europe/Brussels · Open", "Open · collecting responses"); never inside running prose.
- **Brand:** keep the name "Pollendar", the pollen-dot logo, and AT MOST one subtle optional nod to the pollen idea. All copy must be literal and direct (light brand flavour, not strip-everything).
- **Term map** (apply only the in-scope rows):
  - `Availability polling, in bloom` → `Group availability polling`
  - `Pollendar gathers everyone's availability like pollen, and the best time blooms on its own.` → `Everyone marks when they're free, and Pollendar shows the time that works best.`
  - `Open · gathering responses` / `gathering responses` → `Open · collecting responses` / `collecting responses`
  - `Leaning so far` / `Leaning now` → `Top pick so far`
  - doc-comment `which slot is in bloom` (describes UI text) → `which slot is the top pick`
- **Hard boundary:** never change data shapes, props, routes, `data-testid`s, or CSS class names. Do NOT rename `.bloom`, `.bloom-bg`, `BestSlotBloom`, or `data-testid="best-slot-bloom"`. Do NOT touch the winning-slot label/results microcopy (phase 2) or any backend email template (phase 4).

## Verification
- `cd frontend && npm run lint`
- `cd frontend && npm run type-check`
- `cd frontend && npm run test:unit`
- `grep -rn "gathering responses\|Leaning so far\|Leaning now\|like pollen\|, in bloom" frontend/src --include="*.vue" --include="*.ts" | grep -v "__tests__"` returns nothing.
- `grep -rn "—" frontend/src --include="*.vue"` shows no em dash inside prose (the `–` en dash in PollCard date ranges is a different glyph and stays).
- Spot-check that the phase-2 winning-slot label survives unchanged: `grep -rn "Top pick" frontend/src` still shows the phase-2 results/badge usages, and `frontend/src/views/__tests__/PublicThanks.spec.ts` still asserts the winning-slot label `'Top pick'` (set in phase 2) — do not change it.

## Acceptance
- [ ] All in-scope UI copy reads in a plain, direct voice; `grep` for `gathering responses`, `Leaning so far`, `Leaning now`, `like pollen`, and `, in bloom` over `frontend/src` (excluding tests) returns nothing.
- [ ] No em dash (—) appears inside running prose anywhere in `frontend/src/**/*.vue`; the email optional label reads `Email (optional)`.
- [ ] `PollManage.spec.ts` asserts `Open · collecting responses` and `PublicPoll.spec.ts` asserts `Top pick so far`; `PublicThanks.spec.ts`'s winning-slot assertion (`Top pick`, set in phase 2) is left untouched.
- [ ] `cd frontend && npm run lint && npm run type-check && npm run test:unit` all pass; no CSS class, component name, `data-testid`, prop, or route was changed.
