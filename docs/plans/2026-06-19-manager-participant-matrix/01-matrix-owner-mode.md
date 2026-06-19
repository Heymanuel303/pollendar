# Phase 1: ParticipantMatrix read-only owner mode

**Plan:** [manager-participant-matrix](00-overview.md)
**Depends on:** none
**Execution:** solo

## Context
The poll manager (creator) currently sees only a condensed per-slot tally (`ResultsTable`) on `PollManage.vue`. The plan replaces that with the same per-participant `ParticipantMatrix` already used on the public poll page, so the manager sees one row per voter (who voted, what they picked). Before `PollManage.vue` can mount it (phase 2), `ParticipantMatrix.vue` must learn a read-only "owner" mode that omits the editable "You" row entirely — the manager is NOT a voter. This phase only touches the component + its tests; `PublicPoll.vue` must keep behaving exactly as today.

## Objective
Add a backward-compatible owner mode to `ParticipantMatrix.vue` that suppresses the "You" row and makes the voter-only props (`answers` / `yourName`) and the `update:answers` emit optional, across both the desktop table and the mobile card-stack branches.

## Files to touch
- `frontend/src/components/ParticipantMatrix.vue` — add an `owner` (read-only) prop; gate the "You" row + the mobile "Your vote" toggle block on it; make `answers`/`yourName` optional.
- `frontend/src/components/__tests__/ParticipantMatrix.spec.ts` — add an owner-mode suite (no You row, no toggles, participant rows + bloom still render) plus a regression assertion that the existing voter/editable contract is unchanged.

## Steps
1. In `ParticipantMatrix.vue`, extend the `defineProps` generic with a new optional flag `owner?: boolean` and make the voter-only contract optional so the manager need not pass it:
   - Change `answers: Record<string, Availability | null>` to `answers?: Record<string, Availability | null>`.
   - Keep `yourName?: string` and `editable?: boolean` as-is (already optional).
   - In `withDefaults`, add `owner: false` (and keep `yourName: 'You'`, `editable: true`). Default `owner` to `false` so PublicPoll, which passes no `owner` prop, behaves exactly as today.
2. Every existing read of `props.answers` (template uses `answers[slot.id]`) now operates on a possibly-undefined map. Guard each access with `answers?.[slot.id] ?? null` (desktop You-row toggle + read-only glyph spans, and the mobile "Your vote" `AvailabilityToggle` `:model-value`). This keeps PublicPoll identical while making owner mode (no `answers`) safe.
3. Desktop table branch (`data-testid="matrix-table"`, the `<tbody>`): wrap the entire editable "You" `<tr>` (the one whose name cell renders `{{ yourName }}` + the `you` tag, currently the first `tbody` child) in `v-if="!owner"`. In owner mode this row must NOT render at all (not merely be read-only) — the per-participant `v-for="row in participants"` rows are the only body rows. Leave the participant-row `<tr v-for>` untouched.
4. Mobile card-stack branch (`data-testid="matrix-cards"`): wrap the per-card "Your vote" block (the `<div class="mb-4">` containing the `<p>Your vote</p>` label + the inline `AvailabilityToggle`) in `v-if="!owner"`. In owner mode each slot card shows only the read-only Yes/Maybe/No name-chip groups; the toggle disappears. Do not touch the `GROUPS` chip rendering or the `+N more` overflow control.
5. Leave the empty-state line (`<p v-if="participants.length === 0">No responses yet.</p>`) as-is — it is correct for owner mode too (manager with zero voters sees "No responses yet." and no You row).
6. Update the component's top-of-file doc comment to note the dual contract: voter mode (PublicPoll) renders the editable "You" row driven by `answers` + `@update:answers`; owner mode (`owner` prop, manager) renders read-only participant rows only — no You row, no `answers`, no emit.
7. In `ParticipantMatrix.spec.ts`, add a new `describe('ParticipantMatrix (owner / read-only mode)')` covering BOTH breakpoints. Reuse the existing `mountMatrix` helper, passing `{ owner: true }` and omitting `answers` (it currently defaults `answers: {}` in the helper — pass `answers: undefined` in the owner cases to prove the component tolerates a missing map, or add an `owner`-specific mount). Assert:
   - Desktop (`stubMatchMedia(true)`): `wrapper.findAll('tbody tr')` length equals `participants.length` (2) — NO You row; the first body row's name cell shows `Aïcha`, not the `you` tag; `wrapper.findAllComponents(AvailabilityToggle)` is empty; per-participant glyphs still render (e.g. `[data-availability="available"]` exists); bloom still applies to the `s1` column (`[data-testid="matrix-bloom"]` count equals `participants.length`).
   - Mobile (`stubMatchMedia(false)`): `wrapper.findAllComponents(AvailabilityToggle)` is empty (no "Your vote" toggle); the cards still render (`article` count 3) with name chips (`Aïcha`, `Bram`); no `@` appears (privacy); `[data-testid="matrix-card-bloom"]` count is 1.
   - Empty owner case: `{ owner: true, participants: [] }` → text contains `No responses yet` and `tbody tr` length is 0 (no You row, no participant rows).
8. Add a regression assertion in the existing editable suites (or a dedicated `it`) that confirms the voter contract is unchanged: with default props (no `owner`), the You row still renders (`tbody tr` length is `participants.length + 1`), the You-row toggles still emit `update:answers` with `['s1', 'available']`, and `editable: false` still renders read-only You-row glyphs. (Most of this is already covered by the existing tests — verify they still pass unchanged rather than duplicating.)

## Verification
- cd frontend && npm run build
- cd frontend && npm run lint
- cd frontend && npx vitest run src/components/__tests__/ParticipantMatrix.spec.ts
- Manual: not required this phase (no view wiring yet); the owner-mode render is verified via the component tests. Visual confirmation happens in phase 2 on `PollManage.vue`.

## Acceptance
- [x] `ParticipantMatrix.vue` accepts `owner` (default `false`); when `owner` is true, neither the desktop "You" `<tr>` nor the mobile "Your vote" toggle block renders, and the component mounts with no `answers` prop and emits no `update:answers`.
- [x] All pre-existing `ParticipantMatrix.spec.ts` tests (voter/editable + closed read-only You-row) still pass unchanged, proving PublicPoll's contract is backward compatible.
- [x] New owner-mode tests pass for both desktop and mobile, asserting no You row, no `AvailabilityToggle`, participant rows + bloom + privacy (no email) intact.
- [x] `npm run build` and `npm run lint` are clean.
