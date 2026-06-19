# Participant Matrix (Redesign B)

**Slug:** `participant-matrix` (folder: `docs/plans/2026-06-18-participant-matrix/`)
**Created:** 2026-06-18
**Status:** in-progress

## Goal
Add a `Vote | Results` view to the public poll: keep tri-state voting, and add a per-participant matrix (desktop table / mobile card-stack) showing who voted and what they picked — visible to anyone holding the share link, for open and closed polls.

## Scope
- `frontend/src/views/PublicPoll.vue`: `Vote | Results` toggle, Vote-tab refactor, closed-poll behavior change
- new `frontend/src/components/ParticipantMatrix.vue` (adaptive table / card-stack)
- reuse `PollSlotRow.vue`, `AvailabilityToggle.vue`
- `frontend/src/stores/publicPollStore.ts`: participant-rows action (added by the `who-voted-endpoint` plan)
- `frontend/src/composables/useBreakpoint.ts` (created by the `responsive-foundations` plan)

## Out of scope
- The backend endpoint + its FE client/store wiring (the `who-voted-endpoint` plan owns those)
- Any email exposure — `displayName` only

## Constraints
- Matrix data comes from the `who-voted-endpoint` plan's store action; Phase 1 ships WITHOUT it
- Closed polls disable Vote inputs but keep Results visible — reworks the current `PublicPoll.vue:146–155` branch that hard-replaces all inputs with a "poll closed" notice
- Toggle choice persisted in localStorage
- Depends on `responsive-foundations` (`useBreakpoint` + safe-area/touch-target), the matrix mockups, and the `who-voted-endpoint` plan (data)
- Frontend-only verification: `cd frontend && npm run build && npm run lint`

## Acceptance criteria
- [ ] `Vote | Results` toggle persists per device; Vote tab keeps tri-state voting
- [ ] Closed polls show the Results matrix with Vote disabled (not a full "poll closed" replacement)
- [ ] Desktop matrix table: participant rows incl. the voter's own editable row, sticky name column, winning-slot bloom
- [ ] Mobile per-slot card-stack via `useBreakpoint`; touch targets ≥44px
- [ ] build + lint green

## Phases
1. [01-vote-results-toggle](01-vote-results-toggle.md) — toggle + Vote-tab refactor + closed-poll change (no backend dep) · _solo_ ✓
2. [02-desktop-matrix-table](02-desktop-matrix-table.md) — `ParticipantMatrix` desktop table (consumes endpoint) · _solo_
3. [03-mobile-card-stack](03-mobile-card-stack.md) — mobile per-slot card-stack + touch targets · _solo_

## Open questions
- Display-name UX: prompt voters for a recognizable name and handle duplicate names, now that names are shown?
- Matrix scale threshold for pagination/virtualization (endpoint supports `limit/offset`).
