# Phase 1: Calm-glow visuals (near-flat pollen glow)

**Plan:** [plain-copy-and-calm-glow](00-overview.md)
**Depends on:** none
**Execution:** solo
**Status:** completed

## Context
The wider feature makes Pollendar feel calmer and less AI-written: dial the glow/bloom effect down to near-flat, and rewrite UI + email copy into a plain, direct voice (the winning-slot label becomes "✦ Top pick"). This phase owns ONLY the visual glow. Right now the winner reads as a strong gold halo (a 28px blur ring) plus a saturated background wash, which feels loud and over-produced. We want the winner to read mainly via its border/ring + colour, with just a faint 1px pollen ring and a tiny dot glow. The copy rewrite is a separate phase and is explicitly out of scope here.

## Objective
Dial the bloom/glow design tokens in `frontend/src/assets/main.css` down to near-flat values, and update `docs/design/DESIGN-UI.md` so the documented token values match.

## Files to touch
- `frontend/src/assets/main.css` — lower `--shadow-glow`, `.bloom-bg` peak alpha, `.pollen-dot` glow, `.bg-dusk` washes, and the `@keyframes bloom` `from`/`to` so the animated and static glow both go near-flat
- `docs/design/DESIGN-UI.md` — update the documented `shadow-glow` / bloom / bloom-bg token values (and the prose describing the "soft halo") to match the new near-flat values

## Plain-voice style guide (relevant slice for this phase)
This phase changes CSS values and doc token text only, NOT user-facing copy. But when editing `DESIGN-UI.md` prose around the tokens, keep the plain-voice rules in mind: plain, direct, present tense; no hype adjectives; do NOT introduce em dashes (—) inside full sentences (use a period, comma, or parentheses). Do NOT rewrite the `"In bloom"` / `"✦"` copy in this file — that is Phase 2's job. Do NOT rename any CSS class: `.bloom`, `.bloom-bg`, `.pollen-dot`, `.bg-dusk` stay exactly as they are (internal names). The `--shadow-glow` token name and the `shadow-glow` Tailwind utility name also stay.

## Near-flat glow target (decided with the user)
- `--shadow-glow`: drop the blur halo. Keep only a 1px pollen ring, NO 28px halo layer. Target `0 0 0 1px rgb(255 200 87 / 0.40)`.
- `.bloom-bg` radial-gradient peak alpha: lower to ~0.05 (from 0.16).
- `.pollen-dot` box-shadow: shrink to a tiny glow, ~`0 0 4px rgb(255 200 87 / 0.30)` (from `0 0 8px rgb(255 200 87 / 0.55)`).
- `.bg-dusk` page washes: lighten both radial alphas to roughly half (pollen 0.10 → 0.05, indigo 0.12 → 0.06).
- `@keyframes bloom`: animate the 1px ring fading in only (no large halo). Because `to` references `var(--shadow-glow)`, lowering the token already removes the halo from the animation; the `from` stays at zero. Keep the ≤250ms ease-out duration (`--animate-bloom: bloom 0.25s ease-out`) and keep the `prefers-reduced-motion` guard untouched.
- The winner should read mainly via border/ring (`border-pollen/40`, `ring-pollen/40`) + colour, not a halo.
- `--shadow-card` (card elevation, `0 8px 24px rgb(0 0 0 / 0.35)`) stays AS-IS. This change is about the pollen GLOW, not card shadows.

## Steps
1. In `frontend/src/assets/main.css` line 26, lower the glow token. Old:
   `--shadow-glow: 0 0 0 1px rgb(255 200 87 / 0.55), 0 0 28px rgb(255 200 87 / 0.32);`
   New (1px ring only, no halo layer):
   `--shadow-glow: 0 0 0 1px rgb(255 200 87 / 0.40);`
2. Leave `@keyframes bloom` (lines 45–52) structurally as-is: the `from` stays `box-shadow: 0 0 0 0 rgb(255 200 87 / 0);` and the `to` stays `box-shadow: var(--shadow-glow);`. Because step 1 changed the token, the animation now fades the 1px ring in only. Do NOT change `--animate-bloom` (line 32) — keep `bloom 0.25s ease-out`.
3. In `.bg-dusk` (lines 76–78), halve both wash alphas. Old:
   `radial-gradient(900px 520px at 85% -12%, rgb(255 200 87 / 0.1), transparent 60%),`
   `radial-gradient(720px 460px at -5% 110%, rgb(124 138 224 / 0.12), transparent 60%);`
   New: pollen `0.1` → `0.05`, indigo `0.12` → `0.06`.
4. In `.pollen-dot` (line 86), shrink the hardcoded dot glow. Old:
   `box-shadow: 0 0 8px rgb(255 200 87 / 0.55);`
   New: `box-shadow: 0 0 4px rgb(255 200 87 / 0.30);`
   (This is a literal value, NOT a token reference, so it must be edited separately from `--shadow-glow`.)
5. In `.bloom-bg` (lines 96–100), lower the radial peak alpha. Old peak:
   `rgb(255 200 87 / 0.16),`
   New peak: `rgb(255 200 87 / 0.05),` (leave the `rgb(255 200 87 / 0) 70%` fade-out and the `130% 120% at 50% 0%` geometry unchanged).
6. In `docs/design/DESIGN-UI.md`, update the "The bloom" section (lines 84–89). Change the `shadow-glow` documented value from `0 0 0 1px rgb(255 200 87 / .55), 0 0 28px rgb(255 200 87 / .32)` ("a pollen ring plus a warm outer halo") to the new near-flat value `0 0 0 1px rgb(255 200 87 / .40)`, and reword the description to a 1px pollen ring (no halo). Keep the `.bloom-bg` and `✦` bullets present, but adjust the `.bloom-bg` wording to reflect that the wash is now very faint. Do NOT touch the `✦ In bloom` copy here (Phase 2).
7. In `docs/design/DESIGN-UI.md`, update the duplicate `--shadow-glow` value inside the "Implementing in the real app" code block (line 187) so it matches the new token: `--shadow-glow: 0 0 0 1px rgb(255 200 87 / .40);`
8. In `docs/design/DESIGN-UI.md`, soften any prose that describes the old strong halo where it documents the token (e.g. the "soft halo" mention in the design principles, line 12–13, may stay conceptually but should not overstate the halo). Use plain wording and no em dashes inside full sentences. Do NOT rewrite the `"In bloom"` label text — that is Phase 2.
9. Confirm no component hardcodes a glow value outside the tokens. Components apply glow only via the `shadow-glow` Tailwind utility and the `.bloom` / `.bloom-bg` / `.pollen-dot` classes (verified: the only literal `0 0 28px` / `0 0 8px` strings live in `main.css`). No component edits are needed — the CSS token change propagates to `BestSlotBloom.vue`, `ResultsTable.vue`, `ParticipantMatrix.vue`, `AvailabilityGrid.vue`, `PublicThanks.vue`, `Landing.vue`, `PollSlotRow.vue`, and the buttons automatically. If a stray inline glow surfaces during the grep in Verification, dial it down to match.

## Verification
- `cd frontend && npm run lint`
- `cd frontend && npm run type-check`
- `cd frontend && npm run test:unit` — the `.bloom-bg` assertions assert PRESENCE and COUNT, not glow intensity (`AvailabilityGrid.spec.ts` lines 69/104, `ParticipantMatrix.spec.ts` lines 221/227/311/317, `ResultsTable.spec.ts` lines 54/56/61, `Button.spec.ts` line 8 asserts the `shadow-glow` class is present). All must stay green because the class names and utility names are unchanged.
- `grep -rn "0 0 28px" frontend/src` returns NOTHING (the 28px halo layer is gone).
- `grep -rn "0 0 8px" frontend/src` returns NOTHING (the dot glow shrank to 4px).
- `grep -rn "200 87 / 0.16\|200 87 / 0.55\|200 87 / 0.32" frontend/src` returns NOTHING (old high-alpha glow values are gone from main.css).
- `grep -n "28px\|0.55\|0.32\|0.16" docs/design/DESIGN-UI.md` shows no leftover old glow numbers in the token documentation (the design doc matches the new near-flat values).
- Do NOT grep for `In bloom` here — that string is intentionally still present in Phase 1 (it is rewritten in Phase 2).

## Acceptance
- [x] `frontend/src/assets/main.css` `--shadow-glow` is `0 0 0 1px rgb(255 200 87 / 0.40)` (single 1px ring, no 28px halo layer).
- [x] `.bloom-bg` peak alpha is `0.05`, `.pollen-dot` glow is `0 0 4px rgb(255 200 87 / 0.30)`, and `.bg-dusk` washes are `0.05` (pollen) and `0.06` (indigo).
- [x] `@keyframes bloom` and the `prefers-reduced-motion` guard are unchanged structurally and the animation still fades in over `0.25s ease-out`.
- [x] `docs/design/DESIGN-UI.md` documents the new near-flat `shadow-glow` value in both the "The bloom" section and the implementation code block, with no leftover `28px` / `0.55` / `0.32` / `0.16` glow numbers.
- [x] `cd frontend && npm run lint`, `npm run type-check`, and `npm run test:unit` all pass with no changes to any test file.
- [x] No CSS class, the `--shadow-glow` token name, the `shadow-glow` utility name, and no `data-testid` were renamed; no copy strings were changed.
