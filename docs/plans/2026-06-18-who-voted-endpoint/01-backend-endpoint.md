# Phase 1: Backend participant-responses endpoint

**Plan:** [2026-06-18-who-voted-endpoint](00-overview.md)
**Depends on:** none
**Execution:** workflow

## Context
This plan surfaces per-participant responses on the public poll surface — the "who voted, and how" view that the existing aggregate `GET /api/public/polls/:token/results` endpoint deliberately hides. This phase adds the backend half: a new public, unauthenticated `GET /api/public/polls/:token/participants-responses` endpoint returning each participant's `displayName` and per-slot answers, reachable via the capability URL exactly like the other `polls/:token/*` routes. The hard constraint is privacy: a participant's `email` (nullable, `@@unique([pollId, email])`) must NEVER reach the wire — it is excluded at the query level, not mapped away afterward. Phase 2 wires the frontend client/types/store; this phase is the data dependency.

## Objective
Add the participant-responses DTO, PublicService.getParticipantResponses(token, limit?, offset?) joining Response->Participant (select id+displayName, group by participant), and the controller @Get(polls/:token/participants-responses) route, with service + controller specs.

## Files to touch
- `backend/src/public/dto/participant-responses.dto.ts` — NEW. Export `ParticipantAnswer` (`{ pollSlotId: string; availability: Availability }`), `ParticipantWithResponses` (`{ participantId: string; displayName: string; answers: ParticipantAnswer[] }`), and `ParticipantResponses` (`{ participants: ParticipantWithResponses[]; total: number; hasMore: boolean }`). Doc-comment that `participantId`/`pollSlotId` are typed `string` to document the wire contract — the service emits raw `bigint` and the global `BigIntSerializerInterceptor` stringifies them; mirror `dto/poll-results.dto.ts`. Import `Availability` from `@prisma/client`.
- `backend/src/public/public.service.ts` — add `getParticipantResponses(token, limit?, offset?): Promise<ParticipantResponses>`. Resolve the poll by `publicToken` (404 via `NotFoundException` on unknown token, mirroring `getResults`), normalize pagination, run a single `$queryRaw` LEFT JOIN `participants` → `responses` (NO `email` column in the SELECT), and fold rows into one entry per participant. Import the new DTO + `Availability`.
- `backend/src/public/public.controller.ts` — add `@Get('polls/:token/participants-responses')` `getParticipantResponses(@Param('token') token, @Query('limit') limit?, @Query('offset') offset?)` delegating to the service. No `@UseGuards`, no `@Throttle` override (read endpoint stays on the global default like `getPoll`/`getResults`). Add `Query` to the `@nestjs/common` import.
- `backend/src/public/public.service.spec.ts` — add a `describe('getParticipantResponses')` block: 404 on unknown token, fold multi-row participants into one entry with their answers, include zero-response participants (LEFT JOIN), strict no-`email`-leak assertion, pagination passthrough + `hasMore`/`total`.
- `backend/src/public/public.controller.spec.ts` — extend the controller mock to include `getParticipantResponses`; assert `getParticipantResponses` delegates with `(token, limit, offset)` and returns the service value; assert the new route keeps the global throttle default (no per-handler `THROTTLER:LIMITdefault`).

## Steps
1. **DTO.** Create `backend/src/public/dto/participant-responses.dto.ts`. Define `ParticipantAnswer { pollSlotId: string; availability: Availability }`, `ParticipantWithResponses { participantId: string; displayName: string; answers: ParticipantAnswer[] }`, and `ParticipantResponses { participants: ParticipantWithResponses[]; total: number; hasMore: boolean }`. Import `import { Availability } from '@prisma/client'`. Lead with a doc comment exactly like `poll-results.dto.ts` noting the `string` ids are the wire form of `bigint`.
2. **Service signature + token guard.** In `public.service.ts`, import `ParticipantResponses` (and the row/answer types if needed) from `./dto/participant-responses` and `Availability` from `@prisma/client`. Add:
   ```ts
   async getParticipantResponses(token: string, limit?: number, offset?: number): Promise<ParticipantResponses>
   ```
   First `await this.prisma.poll.findUnique({ where: { publicToken: token } })`; `throw new NotFoundException()` if absent (mirror `getResults` — no further queries on a bad token).
3. **Normalize pagination.** Clamp inputs defensively (the controller may hand through raw query strings): `const take = Math.min(Math.max(Number.isFinite(limit) && (limit ?? NaN) > 0 ? Math.floor(limit!) : 100, 1), 1000)` and `const skip = Number.isFinite(offset) && (offset ?? 0) > 0 ? Math.floor(offset!) : 0`. Default `limit` 100, cap 1000; default `offset` 0. (Keep it simple/readable — the intent is: positive-int `take` ≤ 1000, non-negative-int `skip`.)
4. **Count for total/hasMore.** `const total = await this.prisma.participant.count({ where: { pollId: poll.id } })`. This drives `hasMore = skip + take < total` (computed after the page is built, using the actual page length is fine too: `hasMore = skip + participants.length < total`).
5. **Page query — participants first, GROUP BY participant.** Use `$queryRaw` with a typed generic, mirroring `getResults`. CRITICAL: the SELECT lists ONLY `p.id`, `p.display_name`, and response columns — `p.email` MUST NOT appear in any clause. LEFT JOIN keeps participants with zero responses. Paginate the PARTICIPANTS (so `take`/`skip` count participants, not response rows) by selecting the participant page in a subquery / via `ORDER BY p.id LIMIT ${take} OFFSET ${skip}` on a grouped participant set, then join their responses. Concrete shape:
   ```ts
   const rows = await this.prisma.$queryRaw<
     Array<{
       participant_id: bigint;
       display_name: string;
       poll_slot_id: bigint | null;
       availability: Availability | null;
     }>
   >(Prisma.sql`
     SELECT p.id            AS participant_id,
            p.display_name  AS display_name,
            r.poll_slot_id  AS poll_slot_id,
            r.availability  AS availability
     FROM (
       SELECT id, display_name
       FROM participants
       WHERE poll_id = ${poll.id}
       ORDER BY id ASC
       LIMIT ${take} OFFSET ${skip}
     ) p
     LEFT JOIN responses r ON r.participant_id = p.id
     ORDER BY p.id ASC, r.poll_slot_id ASC
   `);
   ```
   Note: subquery-then-LEFT-JOIN paginates by participant count (each participant may answer many slots — `responses @@unique([participantId, pollSlotId])`), avoiding the row-fan-out a flat `LIMIT` would cause. There is NO submit-gate and NO `status` filter — rows are returned for `open` AND `completed`/`cancelled` polls alike (the only gate is a valid token → 404 otherwise).
6. **Fold rows → participants.** Walk `rows` in order, grouping by `participant_id` into a `Map` (or accumulate into the ordered array). For each new participant push `{ participantId: r.participant_id, displayName: r.display_name, answers: [] }`; for each row with a non-null `poll_slot_id` push `{ pollSlotId: r.poll_slot_id, availability: r.availability }` into that participant's `answers`. Skip the synthetic null-response row for zero-response participants (they still appear with `answers: []`). Keep `participant_id`/`poll_slot_id` as raw `bigint` in the returned objects — do NOT `.toString()`; the `BigIntSerializerInterceptor` stringifies them on the wire (the DTO types them `string` only to document that). Return `{ participants, total, hasMore: skip + participants.length < total }`.
7. **Controller route.** In `public.controller.ts` add `Query` to the `@nestjs/common` import. Add (after `getResults`, keeping the write `submit` last):
   ```ts
   /** Per-participant displayName + per-slot answers (never email). 404 on unknown token; works for open AND closed polls. Optional ?limit (default 100, cap 1000) & ?offset. */
   @Get('polls/:token/participants-responses')
   getParticipantResponses(
     @Param('token') token: string,
     @Query('limit') limit?: string,
     @Query('offset') offset?: string,
   ) {
     return this.public_.getParticipantResponses(
       token,
       limit === undefined ? undefined : Number(limit),
       offset === undefined ? undefined : Number(offset),
     );
   }
   ```
   No `@UseGuards`, no `@Throttle` (read endpoint stays on the global default, like the other getters).
8. **Service spec.** In `public.service.spec.ts`, add `describe('getParticipantResponses')`. Reuse the existing `pollFindUnique`/`queryRaw` mocks; add a `participant.count` spy to the `prisma` partial (`participant: { count: participantCount } as never`) and reset it in `beforeEach`. Cover:
   - 404 + no `queryRaw`/`count` for unknown token (`pollFindUnique.mockResolvedValue(null)`).
   - Multi-row fold: feed two rows for participant `1n` (slots `100n`/`101n`) → one entry with two answers, ordered.
   - Zero-response participant: a row with `poll_slot_id: null` → entry with `answers: []`.
   - **No email leak (hard):** assert the returned object and its JSON (with the bigint replacer used elsewhere in this file) contain no `email`/an email value; and assert the `$queryRaw` SQL text passed to the mock does NOT contain `email`/`p.email` (inspect the `Prisma.sql` fragment captured by the mock).
   - Pagination: `total`/`hasMore` from a mocked `count`; default `take` 100 when `limit` omitted; cap at 1000 when over.
9. **Controller spec.** In `public.controller.spec.ts`, add `getParticipantResponses: jest.fn()` to the `PublicService` mock value (alongside `findByPublicToken`) and reset it. Add a test that `controller.getParticipantResponses('tok', '50', '10')` calls the service with `('tok', 50, 10)` and returns its value; add a test that it passes `undefined` for omitted params. Extend the `handlerOf` union and the "leaves the read getters on the global throttle default" test to include `getParticipantResponses` (assert its `THROTTLER:LIMITdefault` metadata is `undefined`).

## Execution strategy
- **Fan-out unit:** one implementer agent owns ALL of Step 1–9 (DTO + service + controller + both specs) as a single coherent change set — the SQL, fold logic, and privacy contract are too tightly coupled to split. Then 2–3 independent adversarial verifier agents, each spawned cold, audit the implemented diff against the privacy/access contract.
- **Shape:** find->transform->verify
- **Isolation:** none (all agents operate on the same working tree under `backend/src/public/`)
- **Verify stage (HIGH-ASSURANCE PRIVACY/SECURITY):** each verifier independently tries to make the endpoint leak `email` or violate access rules, and reports PASS/FAIL with evidence:
  1. **Email-leak audit (every surface):** `grep -rin email backend/src/public/` and confirm `email` appears nowhere in `participant-responses.dto.ts`, `getParticipantResponses`, or its `$queryRaw` SQL (no `SELECT ... email`, no `p.email`, no `participants.*`, no `SELECT *`). Confirm the SELECT enumerates `id`/`display_name` only — not `*` — so a future column can't silently leak. Confirm the fold step never copies a stray field. Trace the wire path: the `BigIntSerializerInterceptor` only stringifies bigints; it does not strip fields, so the absence of `email` must be guaranteed upstream at the SELECT.
  2. **Open AND closed poll access:** confirm there is NO `status` check and NO submit-gate — the only gate is `findUnique({ where: { publicToken } })` → 404. Verify (by reading the service + a spec assertion) that a poll with `status: 'completed'` or `'cancelled'` returns rows identically to `open`.
  3. **Param-injection / pagination abuse:** confirm `limit`/`offset` cannot leak data or error out the process — over-cap `limit` clamps to 1000, negative/NaN/garbage falls back to defaults, and values flow into the query only via `Prisma.sql` `${...}` parameterization (no string concatenation → no SQLi). Confirm pagination counts PARTICIPANTS, not response rows.
  4. **Scope guard:** confirm the diff does NOT touch `getResults`, `submitResponses`, the `slot_tallies` cache, or poll create/edit/complete.

## Verification
- `cd backend && npm run lint && npm test` — both green; the new `getParticipantResponses` service + controller specs pass.
- Manual privacy grep: `grep -rin email backend/src/public/dto/participant-responses.dto.ts backend/src/public/public.service.ts` returns NO match inside `getParticipantResponses` or the new DTO (the pre-existing `submitResponses`/email-conflict code in the service is expected and out of scope).
- Manual SQL read: the `$queryRaw` in `getParticipantResponses` selects `id`/`display_name`/`poll_slot_id`/`availability` only — never `email`, never `*`.

## Acceptance
- [x] `getParticipantResponses(token)` returns `{ participants: [{ participantId, displayName, answers: [{ pollSlotId, availability }] }], total, hasMore }` with NO `email` anywhere — verified by the no-leak spec and the adversarial grep/SQL audit.
- [x] Returns rows for a `completed`/`cancelled` poll identically to `open` — no `status` filter, no submit-gate (only a valid token gates it; unknown → 404).
- [x] `GET /api/public/polls/:token/participants-responses` is registered, unauthenticated (no `@UseGuards`), on the global throttle default, with optional `?limit` (default 100, cap 1000) & `?offset` passed through to the service.
- [x] `cd backend && npm run lint && npm test` pass; existing `getResults`/`submitResponses` specs and the `slot_tallies` cache are untouched.
