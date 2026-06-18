# Phase 2: Frontend wiring — client method, types & store action

**Plan:** [2026-06-18-who-voted-endpoint](00-overview.md)
**Depends on:** 01-backend-endpoint.md
**Execution:** solo

## Context
Phase 1 adds the public `GET /api/public/polls/:token/participants-responses` endpoint returning each participant's `displayName` + per-slot answers (never `email`) as `{ participants[], total, hasMore }`, with optional `?limit&offset`. This phase is the frontend consumer side: it adds the typed client wrapper, the wire types (string ids — the global `BigIntSerializerInterceptor` stringifies the backend's `bigint` `participantId`/`slotId`), and a `publicPollStore` action+state so a future view (Plan 4 — participant matrix) can read participant rows declaratively. No UI is built here — only the client/types/store data path.

## Objective
Add the API client method in lib/api/public-poll.ts, ParticipantRow/ParticipantResponses types (string ids) in lib/api/types.ts, and a publicPollStore action+state to load and hold the participant rows.

## Files to touch
- `frontend/src/lib/api/types.ts` — add `ParticipantResponseAnswer`, `ParticipantRow`, and `ParticipantResponsesResult` wire interfaces (all ids `string`), mirroring the Phase 1 DTO shapes.
- `frontend/src/lib/api/public-poll.ts` — add `getParticipantResponses(token, limit?, offset?)` wrapper (`GET /public/polls/:token/participants-responses` with optional query params); re-export the three new types; extend the backend-contract comment block.
- `frontend/src/stores/publicPollStore.ts` — add `participants` state ref + `participantsTotal`/`participantsHasMore` refs, a `participantsState` `RequestState` ref, and a `loadParticipants(token, opts?)` action; expose them in the store's return object.

## Steps
1. In `frontend/src/lib/api/types.ts`, after the `SubmitResponsesResult` interface (~line 130), add three interfaces mirroring the Phase 1 DTO. Reuse the existing `Availability` type. Document that the slot field is `slotId` here (NOT `pollSlotId`, which is the *submission* field on `ResponseAnswer`), and that all ids are `string` because the global `BigIntSerializerInterceptor` stringifies the backend `bigint`s:
   ```ts
   /**
    * One participant's answer for a single slot, from
    * `GET /api/public/polls/:token/participants-responses`. The slot field is `slotId`
    * (distinct from the submission `ResponseAnswer.pollSlotId`). `slotId` is a `string` —
    * the backend emits raw `bigint` and the global BigIntSerializerInterceptor stringifies it.
    */
   export interface ParticipantResponseAnswer {
     slotId: string
     availability: Availability
   }

   /**
    * One participant row: their public-safe `displayName` + every per-slot answer.
    * PRIVACY: `email` is NEVER present — the backend selects `{ id, displayName }` only.
    * `participantId` is a `string` (stringified `bigint`).
    */
   export interface ParticipantRow {
     participantId: string
     displayName: string
     answers: ParticipantResponseAnswer[]
   }

   /**
    * Per-participant responses page. From `GET /api/public/polls/:token/participants-responses`.
    * `total` is the unfiltered participant count for the poll; `hasMore` is `offset + participants.length < total`.
    */
   export interface ParticipantResponsesResult {
     participants: ParticipantRow[]
     total: number
     hasMore: boolean
   }
   ```
2. In `frontend/src/lib/api/public-poll.ts`, extend the `import type { ... } from '@/lib/api/types'` (lines 20–25) to also import `ParticipantResponsesResult`, and add `ParticipantResponseAnswer`, `ParticipantRow`, `ParticipantResponsesResult` to the `export type { ... }` re-export block (lines 27–38) so views/store have one import site.
3. In the same file, add a contract line to the `Backend contract` JSDoc block (after line 13's `/results` line):
   ```
    *   GET  /api/public/polls/:token/participants-responses → ParticipantResponsesResult (404 on unknown token)
   ```
4. In the same file, add the wrapper after `getResults` (after line 60). The shared `get<T>(path)` takes only a path string (no query-param helper — see `frontend/src/lib/api/client.ts`), so build the query string manually and only append params that are provided:
   ```ts
   /**
    * `GET /api/public/polls/:token/participants-responses`. Resolves the per-participant rows
    * (`displayName` + per-slot answers, NEVER email). Optional `limit` (default 100, cap ~1000 on the
    * backend) and `offset` page the rows. Works for open AND closed polls; 404 on unknown token.
    */
   export function getParticipantResponses(
     token: string,
     limit?: number,
     offset?: number,
   ): Promise<ParticipantResponsesResult> {
     const params = new URLSearchParams()
     if (limit !== undefined) params.set('limit', String(limit))
     if (offset !== undefined) params.set('offset', String(offset))
     const query = params.toString()
     const suffix = query === '' ? '' : `?${query}`
     return get<ParticipantResponsesResult>(
       `/public/polls/${encodeURIComponent(token)}/participants-responses${suffix}`,
     )
   }
   ```
5. In `frontend/src/stores/publicPollStore.ts`, extend the api import (line 4) to include `getParticipantResponses`, and the type import (line 6) to include `ParticipantResponsesResult` and `ParticipantRow`.
6. In the same file, add state refs alongside `results` (after line 30). Do NOT reuse/collide with the existing `load`/`loadResults` actions:
   ```ts
   /** Per-participant rows for the share token, or `[]` before/after a failed load. */
   const participants = ref<ParticipantRow[]>([])
   /** Unfiltered participant count from the last `loadParticipants` (for pagination UI). */
   const participantsTotal = ref(0)
   /** `true` when more rows remain beyond the loaded page. */
   const participantsHasMore = ref(false)
   const participantsState = ref<RequestState>('idle')
   ```
7. In the same file, add the action after `loadResults` (after line 91). Mirror the `loadResults` non-fatal pattern (records error via `applyError`, does NOT throw), but track its own `participantsState`:
   ```ts
   /**
    * Load the per-participant rows for the matrix view. Optional `limit`/`offset` page the rows.
    * A failure is non-fatal (the matrix simply has no rows): it records the error and clears state,
    * but does not throw.
    */
   async function loadParticipants(
     token: string,
     opts?: { limit?: number; offset?: number },
   ): Promise<void> {
     participantsState.value = 'loading'
     resetError()
     try {
       const res: ParticipantResponsesResult = await getParticipantResponses(
         token,
         opts?.limit,
         opts?.offset,
       )
       participants.value = res.participants
       participantsTotal.value = res.total
       participantsHasMore.value = res.hasMore
       participantsState.value = 'success'
     } catch (err) {
       participants.value = []
       participantsTotal.value = 0
       participantsHasMore.value = false
       applyError(err)
       participantsState.value = 'error'
     }
   }
   ```
8. In the same file, add `participants`, `participantsTotal`, `participantsHasMore`, `participantsState`, and `loadParticipants` to the store's returned object (lines 103–113).
9. Update the store's top-of-file JSDoc action list (lines 16–18) with a `loadParticipants(token, opts?)` bullet so the store doc stays accurate.

## Verification
- `cd frontend && npm run build && npm run lint` — type-check confirms the new types thread through the client wrapper and store action; lint stays clean.
- Grep guard for the privacy contract: `grep -rin "email" frontend/src/lib/api/types.ts frontend/src/lib/api/public-poll.ts` must show NO `email` field on any `Participant*` type (email belongs only to `User`/`SubmitResponsesDto`).
- (Optional, if `/test` is run) extend `frontend/src/stores/__tests__/publicPollStore.spec.ts`: add `getParticipantResponses` to the `vi.hoisted` stub + `vi.mock('@/lib/api/public-poll', …)`, then assert `loadParticipants` (a) calls `getParticipantResponses` with `(token, limit, offset)`, (b) populates `participants`/`participantsTotal`/`participantsHasMore` + `participantsState === 'success'` on resolve, and (c) clears them + sets `participantsState === 'error'` (does NOT throw) on an `ApiError(404)`.

## Acceptance
- [x] `getParticipantResponses(token, limit?, offset?)` exists in `public-poll.ts`, hits `/public/polls/:token/participants-responses`, appends `limit`/`offset` only when provided, and is typed `Promise<ParticipantResponsesResult>`.
- [x] `ParticipantResponseAnswer` (`slotId`), `ParticipantRow` (`participantId`, `displayName`, `answers`), and `ParticipantResponsesResult` (`participants`, `total`, `hasMore`) exist in `types.ts` with all ids `string` and NO `email` field.
- [x] `usePublicPollStore` exposes `participants`, `participantsTotal`, `participantsHasMore`, `participantsState`, and a `loadParticipants` action that populates them on success and clears them (without throwing) on failure — distinct from `load`/`loadResults`.
- [x] `npm run build && npm run lint` are green in `frontend/`.
