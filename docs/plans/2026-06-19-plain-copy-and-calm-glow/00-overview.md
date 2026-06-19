# Plain copy and calm glow

**Slug:** `plain-copy-and-calm-glow` (folder: `docs/plans/2026-06-19-plain-copy-and-calm-glow/`)
**Created:** 2026-06-19
**Status:** in-progress

## Goal
Make Pollendar feel calmer and less AI-written. Dial the pollen glow/bloom visual effect down to near-flat, and rewrite the UI and email copy into a plain, direct voice. The winning-slot label changes from "✦ In bloom" to "✦ Top pick" (the ✦ sparkle stays).

## Scope
- `frontend/src/assets/main.css` + `docs/design/DESIGN-UI.md`: near-flat glow design tokens.
- `frontend/src` components & views: the "Top pick" label, plain-voice copy, and the unit specs that assert those strings.
- `backend/src/mail`: email templates and subjects in the plain voice ("Top pick" in the poll-completed email).

## Out of scope
- No behaviour/logic/data/route changes.
- No CSS class / component / `data-testid` renames — `.bloom`, `.bloom-bg`, `.pollen-dot`, `BestSlotBloom`, `best-slot-bloom` all stay as internal names.
- `docs/design/mockups/*.html` are reference artifacts and are not updated here.
- Backend API error messages.

## Constraints
- Near-flat glow target: `--shadow-glow` = a 1px pollen ring with no halo (`0 0 0 1px rgb(255 200 87 / 0.40)`); `.bloom-bg` peak alpha ~0.05; `.pollen-dot` glow `0 0 4px / 0.30`; `.bg-dusk` washes halved. The winner reads via border/ring + colour, not a halo.
- Keep all tests green; every copy-assertion update lands in the SAME phase that changes the copy.
- Keep light brand flavour (name "Pollendar", pollen-dot logo); functional and marketing copy is literal and direct. No em dashes inside running prose; keep `·` only in compact metadata labels.

## Acceptance criteria
- [ ] The winner reads via border/ring + colour, not a gold halo; no `0 0 28px` / `0 0 8px` glow values remain in `frontend/src`.
- [ ] Zero user-facing "In bloom" / "blooms" / "like pollen" copy in `frontend/src`; the winning-slot pill reads "✦ Top pick".
- [ ] No em dash (—) inside running prose in the Vue UI; the email optional label reads "Email (optional)".
- [ ] The poll-completed email shows the "Top pick" chip and plain voice; the magic-link body has no em dash.
- [ ] `frontend`: lint + type-check + test:unit, and `backend`: lint + test, all pass.

## Phases
1. [01-calm-glow-visuals](01-calm-glow-visuals.md) — dial the glow tokens in `main.css` to near-flat and sync `DESIGN-UI.md` · _solo_ ✓
2. [02-direct-winning-slot-copy](02-direct-winning-slot-copy.md) — "✦ In bloom" → "✦ Top pick" across 6 components + Landing/PublicThanks, plus the bloom-microcopy lines and "In bloom" test assertions · _solo_ ✓
3. [03-straightforward-app-copy](03-straightforward-app-copy.md) — plain-voice rewrite of all remaining UI copy, fanned out one agent per screen · _workflow_ ✓
4. [04-email-copy](04-email-copy.md) — email templates + subjects to the plain voice ("Top pick", no em dash) · _solo_

## Order / dependencies
- **01** and **02** are independent (visual tokens vs. copy) and can run in either order.
- **03 depends on 02** — it shares files (Landing, PublicThanks) and needs the "Top pick" label settled first; it must not re-touch the winning-slot label or its assertions.
- **04 depends on 03** — reuses the finalised plain voice.

## Open questions
- The design mockups under `docs/design/mockups/*.html` still show the old "In bloom" label and the strong glow. They are reference-only and left untouched here; re-sync them separately if you want the reference set to match the shipped app.
